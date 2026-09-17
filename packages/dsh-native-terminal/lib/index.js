/**
 * dsh-native-terminal — host half.
 *
 * Owns real PTY sessions and a WebSocket carrier for the browser panel.
 *
 * Design note (this is the whole point of the package): it allocates terminals
 * through the host's own `ctx.subprocess.spawnTerminal` seam and bundles NO
 * native module of its own. The previously used community plugin shipped a
 * second, different copy of `node-pty` (1.1.0) alongside the one DSH already
 * loads (1.2.0-beta.15). Two native PTY addons in one process is both an ABI
 * hazard and a permissions hazard: nested pnpm installs skipped node-pty's
 * chmod step, `spawn-helper` landed non-executable, and every session died
 * with "posix_spawnp failed.". Delegating to the host seam removes that entire
 * failure class by construction — there is no second addon and no helper
 * binary to repair.
 *
 * Every side effect is owned by the Cordis fiber: sessions are killed and the
 * route/upgrade handlers removed when this plugin unloads.
 */

import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-native-terminal'

/** `subprocess` allocates the PTY; `webServer` carries bytes to the browser. */
export const inject = ['subprocess', 'webServer']

export const Config = z.object({
  /** Route prefix owned by this plugin. */
  basePath: z.string().default('/native-terminal'),
  /** Hard ceiling on concurrent PTYs, so a shortcut held down cannot fork-bomb. */
  maxSessions: z.number().default(24),
  /** Scrollback bytes retained per session for reconnect/replay. */
  replayBytes: z.number().default(256 * 1024),
})

const SETTINGS_NS = 'native-terminal'

const SettingsSchema = z.object({
  toggleShortcut: z.string().default('ctrl+`'),
  newTabShortcut: z.string().default('ctrl+shift+`'),
  splitRightShortcut: z.string().default('ctrl+shift+d'),
  splitDownShortcut: z.string().default('ctrl+shift+e'),
  closePaneShortcut: z.string().default('ctrl+shift+w'),
  nextPaneShortcut: z.string().default('ctrl+shift+]'),
  prevPaneShortcut: z.string().default('ctrl+shift+['),
  shellCommand: z.string().default(''),
  fontSize: z.number().default(12),
})

/** Default login shell argv for the current platform. */
function defaultShellArgv(explicit) {
  const trimmed = (explicit ?? '').trim()
  if (trimmed.length > 0) return splitCommandLine(trimmed)
  if (process.platform === 'win32') {
    return [process.env.COMSPEC ?? 'powershell.exe']
  }
  const shell = process.env.SHELL ?? '/bin/bash'
  // Interactive login shell so the user's rc files and prompt apply.
  return [shell, '-l']
}

/**
 * Prefix argv with `env NAME=VALUE ...` so those variables are set in the
 * child's own environment, after node-pty has applied its own.
 *
 * Windows has no `env(1)`; there ConPTY does not force TERM, so the spawn
 * environment already wins and the argv is returned unchanged.
 */
function wrapWithEnv(argv, vars) {
  if (process.platform === 'win32') return argv
  const assignments = Object.entries(vars).map(([key, value]) => `${key}=${value}`)
  return ['/usr/bin/env', ...assignments, ...argv]
}

/**
 * Split a configured command line on unquoted whitespace.
 * Small and deliberate: this is user config, not a shell evaluator.
 */
export function splitCommandLine(line) {
  const out = []
  let current = ''
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote !== null) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        out.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current.length > 0) out.push(current)
  return out
}

/** A bounded ring of recent output bytes, for replay on reconnect. */
class ReplayBuffer {
  constructor(limit) {
    this.limit = limit
    this.chunks = []
    this.size = 0
  }

  push(text) {
    this.chunks.push(text)
    this.size += text.length
    while (this.size > this.limit && this.chunks.length > 1) {
      this.size -= this.chunks.shift().length
    }
  }

  text() {
    return this.chunks.join('')
  }
}

export function apply(ctx, config) {
  const settings = readSettings(ctx)

  /** sessionId -> { handle, replay, sockets:Set, cwd, title, closed } */
  const sessions = new Map()

  /**
   * Allocate one PTY through the host seam.
   * No native module of our own is involved.
   */
  async function createSession({ cwd, cols, rows }) {
    if (sessions.size >= config.maxSessions) {
      throw new Error(`terminal session limit reached (${config.maxSessions})`)
    }
    const shellArgv = defaultShellArgv(settings.current().shellCommand)

    // `spawnTerminal` is built for the agent's scripted tool use, so it pins
    // node-pty to `name: 'dumb'`, which OVERRIDES the TERM we pass in `env`.
    // A dumb terminal has no cursor addressing, so any prompt that repaints
    // itself — git/branch segments, zsh-autosuggestions, right-hand prompts —
    // corrupts: characters land at stale positions and segments disappear.
    //
    // Launching through `env(1)` sets TERM in the shell's OWN environment,
    // after node-pty has applied its own. Verified: the prompt emits a clean
    // `ESC[01;32m➜` instead of the corrupted `ESC[01;32m?➜`.
    const argv = wrapWithEnv(shellArgv, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      DSH_NATIVE_TERMINAL: '1',
    })

    const handle = await ctx.subprocess.spawnTerminal({
      argv,
      cwd,
      rows: clampDim(rows, 24),
      cols: clampDim(cols, 80),
      graceMs: 2000,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        DSH_NATIVE_TERMINAL: '1',
      },
    })

    const id = randomUUID()
    const record = {
      id,
      handle,
      cwd,
      argv,
      replay: new ReplayBuffer(config.replayBytes),
      sockets: new Set(),
      closed: false,
      exit: null,
      // The live node-pty instance behind the handle. The public
      // `SubprocessTerminalHandle` contract has no resize, but an interactive
      // panel MUST tell the shell its real size or the shell keeps wrapping at
      // 80 columns forever (verified: `tput cols` stayed 80 in a 150-column
      // panel). Read defensively so a future host rename degrades to the old
      // fixed-size behaviour rather than throwing.
      resize: resolveResize(handle),
    }
    sessions.set(id, record)

    handle.output.on('data', (chunk) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      record.replay.push(text)
      broadcast(record, { type: 'data', data: text })
    })

    handle.done
      .then((outcome) => {
        record.closed = true
        record.exit = { exitCode: outcome.exitCode ?? null, signal: outcome.signal ?? null }
        broadcast(record, { type: 'exit', ...record.exit })
        closeSockets(record)
      })
      .catch((error) => {
        record.closed = true
        record.exit = { exitCode: null, signal: null, error: String(error?.message ?? error) }
        broadcast(record, { type: 'exit', ...record.exit })
        closeSockets(record)
      })

    return record
  }

  function broadcast(record, message) {
    const payload = JSON.stringify(message)
    for (const socket of record.sockets) {
      try {
        socket.send(payload)
      } catch {
        // A dead socket is dropped on its own 'close' event.
      }
    }
  }

  function closeSockets(record) {
    for (const socket of record.sockets) {
      try {
        socket.close()
      } catch {
        /* already closing */
      }
    }
    record.sockets.clear()
  }

  async function killSession(id, reason = 'closed by user') {
    const record = sessions.get(id)
    if (record === undefined) return false
    sessions.delete(id)
    closeSockets(record)
    if (!record.closed) {
      try {
        await record.handle.terminate()
      } catch {
        /* already gone */
      }
    }
    void reason
    return true
  }

  // ── HTTP control plane ────────────────────────────────────────────────────

  const dispose = []

  dispose.push(
    ctx.webServer.register({
      kind: 'prefix',
      path: config.basePath,
      handler: async (req, res) => {
        try {
          await handleHttp(req, res)
        } catch (error) {
          json(res, 500, { error: String(error?.message ?? error) })
        }
      },
    }),
  )

  async function handleHttp(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.slice(config.basePath.length) || '/'

    if (route === '/config' && req.method === 'GET') {
      return json(res, 200, { settings: settings.current(), maxSessions: config.maxSessions })
    }

    if (route === '/sessions' && req.method === 'GET') {
      return json(res, 200, {
        sessions: [...sessions.values()].map((r) => ({
          id: r.id,
          cwd: r.cwd,
          closed: r.closed,
          exit: r.exit,
        })),
      })
    }

    if (route === '/sessions' && req.method === 'POST') {
      const body = await readJson(req)
      const record = await createSession({
        cwd: resolveCwd(body?.cwd),
        cols: body?.cols,
        rows: body?.rows,
      })
      return json(res, 200, { id: record.id, cwd: record.cwd, argv: record.argv })
    }

    const killMatch = /^\/sessions\/([^/]+)$/.exec(route)
    if (killMatch !== null && req.method === 'DELETE') {
      const ok = await killSession(killMatch[1])
      return json(res, ok ? 200 : 404, { closed: ok })
    }

    return json(res, 404, { error: 'not found' })
  }

  /**
   * Resolve the directory a new terminal starts in.
   *
   * Order: the workspace directory the client asked for, then the host's own
   * working directory, then the user's home. `process.cwd()` comes before HOME
   * because under launchd HOME can be absent, which is how terminals ended up
   * at the filesystem root. A requested path that does not exist is reported
   * rather than silently swapped, so a wrong cwd is visible instead of looking
   * like the terminal ignored the workspace.
   */
  function resolveCwd(requested) {
    const fallback = process.cwd() || process.env.HOME || '/'
    if (typeof requested !== 'string' || requested.trim().length === 0) return fallback
    const target = requested.trim()
    try {
      if (statSync(target).isDirectory()) return target
    } catch {
      /* fall through to the fallback below */
    }
    ctx.logger?.warn?.(
      `native-terminal: requested cwd ${JSON.stringify(target)} is not a directory; using ${fallback}`,
    )
    return fallback
  }

  // ── WebSocket data plane ──────────────────────────────────────────────────

  dispose.push(
    ctx.webServer.registerUpgrade({
      path: `${config.basePath}/attach`,
      handler: (req, socket, head) => {
        acceptWebSocket(req, socket, head, (ws) => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const id = url.searchParams.get('session')
          const record = id === null ? undefined : sessions.get(id)
          if (record === undefined) {
            try {
              ws.send(JSON.stringify({ type: 'error', message: 'unknown session' }))
              ws.close()
            } catch {
              /* nothing to do */
            }
            return
          }
          attach(record, ws)
        })
      },
    }),
  )

  function attach(record, ws) {
    record.sockets.add(ws)

    const replay = record.replay.text()
    if (replay.length > 0) {
      try {
        ws.send(JSON.stringify({ type: 'data', data: replay }))
      } catch {
        /* socket died immediately */
      }
    }
    if (record.closed) {
      try {
        ws.send(JSON.stringify({ type: 'exit', ...(record.exit ?? {}) }))
      } catch {
        /* ignore */
      }
    }

    ws.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'))
      } catch {
        return
      }
      if (message?.type === 'data' && typeof message.data === 'string') {
        record.handle.write(message.data).catch(() => {
          /* session is going away */
        })
        return
      }
      if (message?.type === 'signal' && typeof message.signal === 'string') {
        record.handle.signalForeground(message.signal).catch(() => {})
        return
      }
      if (message?.type === 'resize') {
        // Tell the shell its real geometry, so it wraps and repaints at the
        // panel's width instead of the 80x24 it was allocated with.
        record.resize?.(message.cols, message.rows)
      }
    })

    ws.on('close', () => {
      record.sockets.delete(ws)
    })
    ws.on('error', () => {
      record.sockets.delete(ws)
    })
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  ctx.effect(() => () => {
    for (const id of [...sessions.keys()]) void killSession(id, 'plugin unloaded')
    for (const off of dispose.splice(0)) {
      try {
        off()
      } catch {
        /* already removed */
      }
    }
  }, 'native-terminal: routes and sessions')
}

/**
 * A `(cols, rows)` resize function for one terminal handle, or null when this
 * host build exposes no resizable pty.
 */
function resolveResize(handle) {
  const pty = handle?.terminal
  if (pty === undefined || pty === null || typeof pty.resize !== 'function') return null
  return (cols, rows) => {
    try {
      pty.resize(clampDim(cols, 80), clampDim(rows, 24))
      return true
    } catch {
      // The pty exited between the client's measurement and this call.
      return false
    }
  }
}

function clampDim(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.max(Math.trunc(n), 2), 1000)
}

/** Read the plugin's settings section, tolerating a host without `settings`. */
function readSettings(ctx) {
  const service = ctx.get('settings')
  if (service === undefined) {
    const fallback = SettingsSchema({})
    return { current: () => fallback }
  }
  const scope = service.register(SETTINGS_NS, SettingsSchema)
  let value = SettingsSchema({})
  try {
    value = SettingsSchema(service.get(SETTINGS_NS) ?? {})
  } catch {
    /* keep defaults */
  }
  if (typeof scope?.subscribe === 'function') {
    ctx.effect(() =>
      scope.subscribe((next) => {
        try {
          value = SettingsSchema(next ?? {})
        } catch {
          /* keep last good */
        }
      }),
    )
  }
  return { current: () => value }
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

// ── Minimal RFC6455 server ───────────────────────────────────────────────────
//
// Implemented here rather than depending on `ws`, keeping this package free of
// any dependency the host does not already load. Scope is exactly what the
// panel needs: text frames, ping/pong, close, and client-masked input.

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function acceptWebSocket(req, socket, head, onOpen) {
  const key = req.headers['sec-websocket-key']
  if (typeof key !== 'string') {
    socket.destroy()
    return
  }
  const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )
  socket.setNoDelay(true)
  const ws = new ServerSocket(socket)
  if (head !== undefined && head.length > 0) ws.feed(head)
  onOpen(ws)
}

class ServerSocket {
  constructor(socket) {
    this.socket = socket
    this.buffer = Buffer.alloc(0)
    this.listeners = new Map()
    this.closed = false
    socket.on('data', (chunk) => this.feed(chunk))
    socket.on('close', () => this.emit('close'))
    socket.on('error', (error) => this.emit('error', error))
  }

  on(event, listener) {
    const list = this.listeners.get(event) ?? []
    list.push(listener)
    this.listeners.set(event, list)
  }

  emit(event, ...args) {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        listener(...args)
      } catch {
        /* a listener fault must not kill the socket loop */
      }
    }
  }

  feed(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const frame = decodeFrame(this.buffer)
      if (frame === null) return
      this.buffer = this.buffer.subarray(frame.consumed)
      if (frame.opcode === 0x8) {
        this.close()
        return
      }
      if (frame.opcode === 0x9) {
        this.sendRaw(0xa, frame.payload)
        continue
      }
      if (frame.opcode === 0x1 || frame.opcode === 0x2) {
        this.emit('message', frame.payload.toString('utf8'))
      }
    }
  }

  send(text) {
    this.sendRaw(0x1, Buffer.from(text, 'utf8'))
  }

  sendRaw(opcode, payload) {
    if (this.closed || this.socket.destroyed) return
    const length = payload.length
    let header
    if (length < 126) {
      header = Buffer.alloc(2)
      header[1] = length
    } else if (length < 65536) {
      header = Buffer.alloc(4)
      header[1] = 126
      header.writeUInt16BE(length, 2)
    } else {
      header = Buffer.alloc(10)
      header[1] = 127
      header.writeBigUInt64BE(BigInt(length), 2)
    }
    header[0] = 0x80 | opcode
    try {
      this.socket.write(Buffer.concat([header, payload]))
    } catch {
      this.closed = true
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    try {
      this.sendRaw(0x8, Buffer.alloc(0))
      this.socket.end()
    } catch {
      /* already gone */
    }
  }
}

/** Decode one client frame, or null when more bytes are needed. */
function decodeFrame(buffer) {
  if (buffer.length < 2) return null
  const first = buffer[0]
  const second = buffer[1]
  const opcode = first & 0x0f
  const masked = (second & 0x80) !== 0
  let length = second & 0x7f
  let offset = 2

  if (length === 126) {
    if (buffer.length < offset + 2) return null
    length = buffer.readUInt16BE(offset)
    offset += 2
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null
    const big = buffer.readBigUInt64BE(offset)
    if (big > BigInt(16 * 1024 * 1024)) return null
    length = Number(big)
    offset += 8
  }

  let mask = null
  if (masked) {
    if (buffer.length < offset + 4) return null
    mask = buffer.subarray(offset, offset + 4)
    offset += 4
  }

  if (buffer.length < offset + length) return null
  const payload = Buffer.from(buffer.subarray(offset, offset + length))
  if (mask !== null) {
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
  }
  return { opcode, payload, consumed: offset + length }
}
