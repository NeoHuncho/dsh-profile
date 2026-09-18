/**
 * Worktree environments.
 *
 * A workspace opts in with `.agents/env.json`. For such a project every new
 * conversation gets its own git worktree (a *child workspace* registered in
 * the workspace registry so sessions attach to it normally), a block of ports
 * allocated by increment, and optional setup/start/stop/teardown scripts.
 *
 * Nothing starts on creation: `start` runs only when the user presses Start.
 * Settling a conversation tears its environment down (uncommitted work is
 * committed to the env branch, which is kept forever; the worktree directory
 * and the child workspace disappear). Unsettling restores it from the branch.
 *
 * The registry (`$DSH_HOME/storages/env-registry.json`) is the single source
 * of truth and is written atomically. Started processes are detached into
 * their own process group with output redirected to a log file, so they
 * survive a harness restart; liveness is re-derived from the pid (and the
 * optional health port) rather than from an in-memory handle.
 */

import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, symlinkSync, writeFileSync, closeSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve as resolvePath } from 'node:path'

export const ENV_FILE = '.agents/env.json'

const ADJECTIVES = ['amber', 'brisk', 'calm', 'coral', 'dusky', 'eager', 'fern', 'gold', 'hazel', 'ivory', 'jade', 'keen', 'lunar', 'misty', 'noble', 'olive', 'pearl', 'quiet', 'rosy', 'sage', 'teal', 'umber', 'vivid', 'warm']
const NOUNS = ['fox', 'owl', 'elk', 'lynx', 'wren', 'hare', 'newt', 'ibis', 'kite', 'mole', 'orca', 'pike', 'seal', 'swan', 'toad', 'vole', 'yak', 'crane', 'finch', 'heron']

function expandHome(p) {
  return p.startsWith('~/') || p === '~' ? join(homedir(), p.slice(1)) : p
}

export function dshHome() {
  return expandHome(process.env.DSH_HOME || join(homedir(), '.dsh'))
}

/** Read and validate a project's env.json; `undefined` when absent. */
export function readEnvConfig(projectPath) {
  const file = join(projectPath, ENV_FILE)
  let info
  try { info = statSync(file) } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
  if (!info.isFile()) return undefined
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  if (raw?.version !== 1) throw new Error(`${ENV_FILE}: version must be 1`)
  const str = (k, fallback) => (typeof raw[k] === 'string' && raw[k].trim() !== '' ? raw[k].trim() : fallback)
  const ports = raw.ports ?? {}
  const num = (v, fallback) => (Number.isInteger(v) && v >= 0 ? v : fallback)
  return {
    worktreeRoot: str('worktreeRoot', '.worktrees/{slug}'),
    branchPrefix: str('branchPrefix', 'env/'),
    share: Array.isArray(raw.share) ? raw.share.filter((s) => typeof s === 'string' && s !== '' && !s.includes('..')) : ['node_modules'],
    ports: { base: num(ports.base, 0), count: Math.min(num(ports.count, 0), 16), stride: Math.max(1, num(ports.stride, 10)) },
    healthPort: Number.isInteger(raw.healthPort) ? raw.healthPort : undefined,
    setup: str('setup', undefined),
    start: str('start', undefined),
    stop: str('stop', undefined),
    teardown: str('teardown', undefined),
    label: str('label', undefined),
  }
}

// ── registry ────────────────────────────────────────────────────────────────

export function createEnvRegistry(file = join(dshHome(), 'storages', 'env-registry.json')) {
  let state = { version: 1, envs: {} }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed?.version === 1 && parsed.envs && typeof parsed.envs === 'object') state = parsed
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('[workspace-console] env registry unreadable, starting empty', error)
  }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true })
    const temp = `${file}.tmp-${process.pid}-${randomUUID()}`
    writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`)
    renameSync(temp, file)
  }
  return {
    all: () => Object.values(state.envs),
    get: (id) => state.envs[id],
    byDir: (dir) => Object.values(state.envs).find((e) => e.dir === dir),
    byChildWorkspace: (wid) => Object.values(state.envs).find((e) => e.childWorkspaceId === wid),
    put(env) {
      state.envs[env.id] = env
      save()
      return env
    },
    remove(id) {
      delete state.envs[id]
      save()
    },
  }
}

// ── engine ──────────────────────────────────────────────────────────────────

/**
 * @param deps.workspaceRegistry host workspace registry
 * @param deps.logger optional logger
 * @param deps.onChange called after any registry mutation (for client refresh)
 */
export function createEnvEngine(deps) {
  const registry = deps.registry ?? createEnvRegistry()
  const logDir = join(dshHome(), 'storages', 'env-logs')
  const logger = deps.logger ?? console
  const changed = () => { try { deps.onChange?.() } catch { /* observer only */ } }

  const git = (cwd, args, opts = {}) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', ...opts })
    if (result.status !== 0 && !opts.allowFailure) {
      throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`)
    }
    return result
  }

  const isGitRepo = (path) => git(path, ['rev-parse', '--is-inside-work-tree'], { allowFailure: true }).status === 0

  function pidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false
    try { process.kill(pid, 0); return true } catch (error) { return error?.code === 'EPERM' }
  }

  function portListening(port) {
    if (!Number.isInteger(port) || port <= 0) return false
    const r = spawnSync('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
    return r.status === 0 && r.stdout.trim() !== ''
  }

  /** Re-derive `running` from the real world and persist a state change. */
  function refresh(env) {
    if (env.state === 'torn-down') return env
    const alive = pidAlive(env.pid) || (env.healthPortValue !== undefined && portListening(env.healthPortValue))
    const next = alive ? 'running' : env.state === 'created' ? 'created' : 'stopped'
    if (next !== env.state || (!alive && env.pid)) {
      env.state = next
      if (!alive) env.pid = undefined
      registry.put(env)
    }
    return env
  }

  function envVars(env) {
    const vars = {
      ENV_ID: env.id,
      ENV_SLUG: env.slug,
      ENV_DIR: env.dir,
      ENV_ROOT: env.parentPath,
      ENV_BRANCH: env.branch,
      ENV_INDEX: String(env.index),
      ENV_PORTS: env.ports.join(','),
    }
    env.ports.forEach((port, i) => { vars[`ENV_PORT_${i}`] = String(port) })
    return vars
  }

  function scriptArgv(script) {
    return ['/bin/bash', '-lc', `exec ${script}`]
  }

  /** Run a lifecycle script to completion, appending to the env log. */
  function runScript(env, script, phase) {
    if (!script) return { ok: true }
    mkdirSync(logDir, { recursive: true })
    const log = join(logDir, `${env.id}.log`)
    const fd = openSync(log, 'a')
    writeFileSync(fd, `\n=== ${phase} ${new Date().toISOString()} ===\n`)
    const [cmd, ...args] = scriptArgv(script)
    const result = spawnSync(cmd, args, {
      cwd: env.dir,
      env: { ...process.env, ...envVars(env) },
      stdio: ['ignore', fd, fd],
      timeout: 15 * 60 * 1000,
    })
    closeSync(fd)
    if (result.status !== 0) {
      const tail = readFileSync(log, 'utf8').split('\n').slice(-15).join('\n')
      throw new Error(`${phase} script failed (exit ${result.status ?? result.signal})\n${tail}`)
    }
    return { ok: true }
  }

  function pickSlug(parentPath) {
    const used = new Set(registry.all().filter((e) => e.parentPath === parentPath).map((e) => e.slug))
    for (let i = 0; i < 200; i += 1) {
      const slug = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]}-${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`
      if (!used.has(slug)) return slug
    }
    return `env-${randomUUID().slice(0, 8)}`
  }

  /** Smallest index not used by a live (not torn-down) env of this project. */
  function pickIndex(parentPath) {
    const taken = new Set(registry.all().filter((e) => e.parentPath === parentPath && e.state !== 'torn-down').map((e) => e.index))
    let i = 0
    while (taken.has(i)) i += 1
    return i
  }

  function resolveDir(parentPath, config, slug) {
    const template = expandHome(config.worktreeRoot).replaceAll('{slug}', slug).replaceAll('{project}', basename(parentPath))
    return isAbsolute(template) ? template : resolvePath(parentPath, template)
  }

  function shareInto(env, config) {
    for (const entry of config.share) {
      const source = join(env.parentPath, entry)
      const target = join(env.dir, entry)
      if (!existsSync(source) || existsSync(target)) continue
      mkdirSync(dirname(target), { recursive: true })
      symlinkSync(source, target)
    }
  }

  function excludeShares(env, config) {
    // Symlinked shares must not show up as untracked files in the worktree.
    // `.git` in a worktree is a file pointing at the gitdir, so use `git rev-parse`.
    const gitdir = git(env.dir, ['rev-parse', '--git-path', 'info/exclude']).stdout.trim()
    const excludeFile = resolvePath(env.dir, gitdir)
    mkdirSync(dirname(excludeFile), { recursive: true })
    const lines = config.share.map((s) => `/${s}`).join('\n')
    writeFileSync(excludeFile, `${existsSync(excludeFile) ? readFileSync(excludeFile, 'utf8').trimEnd() + '\n' : ''}${lines}\n`)
  }

  function view(env) {
    const { pid, ...rest } = env
    return { ...rest, running: env.state === 'running', pid }
  }

  return {
    registry,
    /** Whether `projectPath` opts into environments (and its config). */
    describeProject(projectPath) {
      const config = readEnvConfig(projectPath)
      return config === undefined ? undefined : { config, gitRepo: isGitRepo(projectPath) }
    },

    list() {
      return registry.all().map((env) => view(refresh(env)))
    },

    status(envId) {
      const env = registry.get(envId)
      return env === undefined ? undefined : view(refresh(env))
    },

    forDir(dir) {
      const env = registry.byDir(dir)
      return env === undefined ? undefined : view(refresh(env))
    },

    /** Create the worktree + child workspace for one new conversation. */
    async create(parentWorkspace) {
      const parentPath = parentWorkspace.path
      const config = readEnvConfig(parentPath)
      if (config === undefined) throw new Error(`${parentPath} has no ${ENV_FILE}`)
      if (!isGitRepo(parentPath)) throw new Error(`${parentPath} is not a git repository`)

      const slug = pickSlug(parentPath)
      const index = pickIndex(parentPath)
      const dir = resolveDir(parentPath, config, slug)
      const branch = `${config.branchPrefix}${slug}`
      const ports = Array.from({ length: config.ports.count }, (_, i) => config.ports.base + index * config.ports.stride + i)
      const env = {
        id: randomUUID(),
        slug,
        index,
        parentWorkspaceId: parentWorkspace.id,
        parentPath,
        dir,
        branch,
        ports,
        healthPortValue: config.healthPort !== undefined ? ports[config.healthPort] : undefined,
        state: 'created',
        createdAt: new Date().toISOString(),
        label: config.label,
      }

      if (existsSync(dir)) throw new Error(`${dir} already exists`)
      mkdirSync(dirname(dir), { recursive: true })
      git(parentPath, ['worktree', 'add', '-b', branch, dir, 'HEAD'])
      try {
        shareInto(env, config)
        excludeShares(env, config)
        registry.put(env)
        runScript(env, config.setup, 'setup')
      } catch (error) {
        git(parentPath, ['worktree', 'remove', '--force', dir], { allowFailure: true })
        git(parentPath, ['branch', '-D', branch], { allowFailure: true })
        registry.remove(env.id)
        throw error
      }

      const child = await deps.workspaceRegistry.create(dir, `${parentWorkspace.title || basename(parentPath)} · ${slug}`)
      env.childWorkspaceId = child.id
      registry.put(env)
      // A new workspace is prepended; keep it right after its parent instead.
      try {
        const order = deps.workspaceRegistry.list().map((w) => w.id)
        const parentIdx = order.indexOf(parentWorkspace.id)
        const after = order[parentIdx + 1]
        if (parentIdx >= 0 && after !== child.id) await deps.workspaceRegistry.insertBefore(child.id, after)
      } catch (error) {
        logger.warn?.(`[workspace-console] could not reorder env workspace: ${error?.message ?? error}`)
      }
      changed()
      return view(env)
    },

    async start(envId) {
      const env = registry.get(envId)
      if (env === undefined) throw new Error('unknown environment')
      if (env.state === 'torn-down') throw new Error('environment is torn down; restore it first')
      refresh(env)
      if (env.state === 'running') return view(env)
      const config = readEnvConfig(env.parentPath)
      if (config?.start === undefined) throw new Error(`${ENV_FILE} defines no start script`)

      mkdirSync(logDir, { recursive: true })
      const log = join(logDir, `${env.id}.log`)
      const fd = openSync(log, 'a')
      writeFileSync(fd, `\n=== start ${new Date().toISOString()} ===\n`)
      const [cmd, ...args] = scriptArgv(config.start)
      const child = spawn(cmd, args, {
        cwd: env.dir,
        env: { ...process.env, ...envVars(env) },
        stdio: ['ignore', fd, fd],
        detached: true,
      })
      closeSync(fd)
      child.unref()
      child.on('exit', () => {
        const current = registry.get(env.id)
        if (current !== undefined && current.pid === child.pid) {
          current.pid = undefined
          current.state = 'stopped'
          registry.put(current)
          changed()
        }
      })
      env.pid = child.pid
      env.state = 'running'
      env.startedAt = new Date().toISOString()
      registry.put(env)
      changed()
      return view(env)
    },

    async stop(envId) {
      const env = registry.get(envId)
      if (env === undefined) throw new Error('unknown environment')
      const config = readEnvConfig(env.parentPath)
      if (config?.stop) {
        try { runScript(env, config.stop, 'stop') } catch (error) { logger.warn?.(String(error?.message ?? error)) }
      }
      if (pidAlive(env.pid)) {
        try { process.kill(-env.pid, 'SIGTERM') } catch { try { process.kill(env.pid, 'SIGTERM') } catch { /* gone */ } }
        const deadline = Date.now() + 8000
        while (pidAlive(env.pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200))
        if (pidAlive(env.pid)) { try { process.kill(-env.pid, 'SIGKILL') } catch { /* gone */ } }
      }
      // A process started outside the engine (e.g. an agent's harness.sh) is
      // found through the health port and asked to stop too.
      if (env.healthPortValue !== undefined && portListening(env.healthPortValue)) {
        const r = spawnSync('/usr/sbin/lsof', ['-nP', `-iTCP:${env.healthPortValue}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
        for (const pid of r.stdout.split(/\s+/).map(Number).filter((n) => n > 0)) { try { process.kill(pid, 'SIGTERM') } catch { /* gone */ } }
      }
      env.pid = undefined
      if (env.state !== 'torn-down') env.state = 'stopped'
      registry.put(env)
      changed()
      return view(env)
    },

    async restart(envId) {
      await this.stop(envId)
      return this.start(envId)
    },

    /** Stop, commit WIP to the env branch, remove the worktree and child workspace. */
    async teardown(envId) {
      const env = registry.get(envId)
      if (env === undefined) throw new Error('unknown environment')
      if (env.state === 'torn-down') return view(env)
      await this.stop(envId)
      const config = readEnvConfig(env.parentPath)
      if (existsSync(env.dir)) {
        if (config?.teardown) {
          try { runScript(env, config.teardown, 'teardown') } catch (error) { logger.warn?.(String(error?.message ?? error)) }
        }
        const dirty = git(env.dir, ['status', '--porcelain'], { allowFailure: true }).stdout.trim() !== ''
        if (dirty) {
          git(env.dir, ['add', '-A'], { allowFailure: true })
          git(env.dir, ['-c', 'user.name=dsh env', '-c', 'user.email=dsh-env@localhost', 'commit', '-qm', `wip: environment ${env.slug} settled`], { allowFailure: true })
        }
        git(env.parentPath, ['worktree', 'remove', '--force', env.dir])
      }
      git(env.parentPath, ['worktree', 'prune'], { allowFailure: true })
      if (env.childWorkspaceId) {
        try { await deps.workspaceRegistry.delete(env.childWorkspaceId) } catch (error) { logger.warn?.(String(error?.message ?? error)) }
      }
      env.state = 'torn-down'
      env.tornDownAt = new Date().toISOString()
      registry.put(env)
      changed()
      return view(env)
    },

    /** Recreate a torn-down worktree from its kept branch. */
    async restore(envId) {
      const env = registry.get(envId)
      if (env === undefined) throw new Error('unknown environment')
      if (env.state !== 'torn-down') return view(env)
      const config = readEnvConfig(env.parentPath)
      if (config === undefined) throw new Error(`${env.parentPath} has no ${ENV_FILE}`)
      const parent = deps.workspaceRegistry.get(env.parentWorkspaceId) ?? (await deps.workspaceRegistry.resolveByPath(env.parentPath))
      env.index = pickIndex(env.parentPath)
      env.ports = Array.from({ length: config.ports.count }, (_, i) => config.ports.base + env.index * config.ports.stride + i)
      env.healthPortValue = config.healthPort !== undefined ? env.ports[config.healthPort] : undefined
      mkdirSync(dirname(env.dir), { recursive: true })
      git(env.parentPath, ['worktree', 'add', env.dir, env.branch])
      shareInto(env, config)
      excludeShares(env, config)
      env.state = 'stopped'
      registry.put(env)
      try { runScript(env, config.setup, 'setup') } catch (error) { logger.warn?.(String(error?.message ?? error)) }
      const child = await deps.workspaceRegistry.create(env.dir, `${parent?.title || basename(env.parentPath)} · ${env.slug}`)
      env.childWorkspaceId = child.id
      env.parentWorkspaceId = parent?.id ?? env.parentWorkspaceId
      registry.put(env)
      changed()
      return view(env)
    },

    /** Forget a torn-down env (its branch stays in git). */
    forget(envId) {
      const env = registry.get(envId)
      if (env !== undefined && env.state === 'torn-down') {
        registry.remove(envId)
        changed()
      }
    },

    logTail(envId, lines = 200) {
      const log = join(logDir, `${envId}.log`)
      try { return readFileSync(log, 'utf8').split('\n').slice(-lines).join('\n') } catch { return '' }
    },
  }
}
