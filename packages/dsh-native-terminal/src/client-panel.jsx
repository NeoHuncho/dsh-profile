/**
 * dsh-native-terminal — the bottom terminal panel.
 *
 * Renders a resizable dock at the foot of the conversation column, holding
 * tabs of split panes. Each pane is an xterm.js instance bound to one host PTY
 * session over a WebSocket.
 *
 * Layout: the panel is PORTALLED out of its slot seat and appended to the
 * conversation column root as its last flex child. That root is a
 * `flex-direction: column` box holding the scrolling transcript and the
 * composer, so a sibling with a fixed height genuinely SHRINKS the chat and
 * pushes it up, instead of floating over it. Registering in place would instead
 * trap the panel inside the composer's own stack, where it inherits the
 * composer's narrower width and cannot reach the column's full height.
 *
 * xterm.js is pure JavaScript, so nothing here pulls a native module into the
 * page or the host process.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import xtermCss from '@xterm/xterm/css/xterm.css?raw'

import { parseShortcut, matchesShortcut } from './shortcut.js'
import {
  leaf,
  splitPane,
  removePane,
  paneIds,
  paneCount,
  nextPane,
  prevPane,
  setRatio,
} from './layout.js'

const BASE = '/native-terminal'
const HEIGHT_KEY = 'dsh-native-terminal.height'
const MIN_HEIGHT = 120

/* xterm's stylesheet is injected once, tagged so it is easy to find in devtools. */
const XTERM_STYLE_ID = 'dsh-native-terminal-xterm-css'
if (typeof document !== 'undefined' && document.getElementById(XTERM_STYLE_ID) === null) {
  const tag = document.createElement('style')
  tag.id = XTERM_STYLE_ID
  tag.textContent = xtermCss
  document.head.appendChild(tag)
}

let paneSeq = 0
const nextPaneId = () => `pane-${++paneSeq}`

/**
 * Find the conversation column root to dock into.
 *
 * Structure (verified live, not assumed): the composer seat sits inside a
 * scroll body, itself inside the column root — a `flex-direction: column` box
 * spanning the full width beside the sidebar and the full viewport height.
 * Walking up from our own seat to the outermost such flex column is resilient
 * to the shell's hashed CSS-module class names, which are not a stable API.
 */
function findDockHost(from) {
  let el = from
  let best = null
  for (let i = 0; i < 14 && el !== null && el !== document.body; i++) {
    const style = window.getComputedStyle(el)
    if (style.display === 'flex' && style.flexDirection === 'column') {
      const rect = el.getBoundingClientRect()
      // The column root fills the viewport height; inner stacks do not.
      if (rect.height >= window.innerHeight - 4 && rect.width > 200) best = el
    }
    el = el.parentElement
  }
  return best
}

/** True when the app is currently rendering its dark theme. */
function isDarkTheme() {
  if (typeof window === 'undefined') return true
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--dsw-alias-bg-l1')
    .trim()
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(bg)
  if (rgb !== null) {
    const luma = (Number(rgb[1]) * 299 + Number(rgb[2]) * 587 + Number(rgb[3]) * 114) / 1000
    return luma < 128
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(bg)
  if (hex !== null) {
    const n = parseInt(hex[1], 16)
    const luma = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000
    return luma < 128
  }
  return !window.matchMedia?.('(prefers-color-scheme: light)').matches
}

/**
 * Terminal colours.
 *
 * A COMPLETE 16-colour ANSI palette is mandatory, not decoration: zsh-autosuggestions
 * paints its inline completion with a dim ANSI colour (bright black / colour 8),
 * and `ls`, git and prompts all rely on the standard slots. Supplying only
 * background/foreground leaves those slots at xterm's defaults, which is why the
 * autosuggestion looked wrong against this surface.
 *
 * These are the standard macOS Terminal / VS Code dark and light sets, so output
 * matches what the same commands look like in a native terminal.
 */
function readTheme() {
  const dark = isDarkTheme()
  const surface = getComputedStyle(document.documentElement)
    .getPropertyValue('--dsw-alias-bg-l1')
    .trim()

  if (dark) {
    return {
      background: surface.length > 0 ? surface : '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#cccccc',
      cursorAccent: '#1e1e1e',
      selectionBackground: 'rgba(120, 150, 200, 0.35)',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      // Bright black is the autosuggestion colour: visible, clearly dimmer.
      brightBlack: '#6a7076',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff',
    }
  }

  return {
    background: surface.length > 0 ? surface : '#ffffff',
    foreground: '#333333',
    cursor: '#333333',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(80, 130, 200, 0.28)',
    black: '#000000',
    red: '#cd3131',
    green: '#12813e',
    yellow: '#949800',
    blue: '#0451a5',
    magenta: '#bc05bc',
    cyan: '#0598bc',
    white: '#555555',
    brightBlack: '#8b9096',
    brightRed: '#cd3131',
    brightGreen: '#14ce5c',
    brightYellow: '#b5ba00',
    brightBlue: '#0451a5',
    brightMagenta: '#bc05bc',
    brightCyan: '#0598bc',
    brightWhite: '#a5a5a5',
  }
}

/**
 * One terminal pane: owns its xterm instance, its PTY session and its socket.
 */
function TerminalPane({ paneId, cwd, fontSize, focused, onFocus, onExit, registerFocuser }) {
  const hostRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const socketRef = useRef(null)
  const sessionRef = useRef(null)

  useEffect(() => {
    const element = hostRef.current
    if (element === null) return undefined

    let disposed = false
    const term = new Terminal({
      fontSize,
      // A literal stack, NOT a CSS var(): xterm measures the font from this
      // string in canvas, where `var(...)` never resolves and silently falls
      // back to a proportional font — which misaligns every column.
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, "Cascadia Mono", "Roboto Mono", "Courier New", monospace',
      fontWeight: 400,
      fontWeightBold: 600,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      drawBoldTextInBrightColors: false,
      minimumContrastRatio: 1,
      scrollback: 10000,
      theme: readTheme(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    try {
      term.loadAddon(new WebLinksAddon())
    } catch {
      /* links are a nicety, never fatal */
    }
    term.open(element)
    termRef.current = term
    fitRef.current = fit

    try {
      fit.fit()
    } catch {
      /* element not laid out yet; the observer will retry */
    }

    async function connect() {
      let session
      try {
        const response = await fetch(`${BASE}/sessions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cwd, cols: term.cols, rows: term.rows }),
        })
        if (!response.ok) throw new Error(await response.text())
        session = await response.json()
      } catch (error) {
        if (!disposed) term.write(`\r\n\x1b[31mFailed to start terminal: ${String(error)}\x1b[0m\r\n`)
        return
      }
      if (disposed) {
        void fetch(`${BASE}/sessions/${session.id}`, { method: 'DELETE' })
        return
      }
      sessionRef.current = session.id

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(
        `${protocol}//${window.location.host}${BASE}/attach?session=${encodeURIComponent(session.id)}`,
      )
      socketRef.current = socket

      socket.addEventListener('message', (event) => {
        let message
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }
        if (message.type === 'data') term.write(message.data)
        else if (message.type === 'exit') {
          term.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n')
          onExit?.(paneId)
        } else if (message.type === 'error') {
          term.write(`\r\n\x1b[31m${message.message}\x1b[0m\r\n`)
        }
      })

      term.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'data', data }))
        }
      })

      // The PTY was allocated at the size measured before this socket existed.
      // Announce the real grid once attached, then on every change below.
      socket.addEventListener('open', () => sendResize(term.cols, term.rows))
    }

    /** Tell the host the shell's new geometry (deduplicated). */
    let lastSize = ''
    function sendResize(cols, rows) {
      if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 2 || rows < 2) return
      const key = `${cols}x${rows}`
      if (key === lastSize) return
      lastSize = key
      const socket = socketRef.current
      if (socket === null || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ type: 'resize', cols, rows }))
    }

    void connect()

    // Keep the shell's idea of the width in step with the rendered grid.
    // Without this the shell wraps at its original 80 columns regardless of the
    // panel size, which corrupts long lines and repainting prompts.
    term.onResize(({ cols, rows }) => sendResize(cols, rows))

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* zero-size during collapse */
      }
    })
    observer.observe(element)

    return () => {
      disposed = true
      observer.disconnect()
      try {
        socketRef.current?.close()
      } catch {
        /* already closed */
      }
      if (sessionRef.current !== null) {
        void fetch(`${BASE}/sessions/${sessionRef.current}`, { method: 'DELETE' })
      }
      term.dispose()
    }
    // cwd/fontSize changes intentionally do not recreate a live shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId])

  /* Keep font size live without tearing down the session. */
  useEffect(() => {
    const term = termRef.current
    if (term === null) return
    term.options.fontSize = fontSize
    try {
      fitRef.current?.fit()
    } catch {
      /* ignore */
    }
  }, [fontSize])

  /* Follow app light/dark changes without restarting the shell. */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const term = termRef.current
      if (term !== null) term.options.theme = readTheme()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    })
    return () => observer.disconnect()
  }, [])

  /* Let the panel focus this pane by id (shortcut navigation). */
  useEffect(() => {
    registerFocuser?.(paneId, () => {
      try {
        termRef.current?.focus()
      } catch {
        /* disposed */
      }
    })
    return () => registerFocuser?.(paneId, null)
  }, [paneId, registerFocuser])

  useEffect(() => {
    if (focused) {
      try {
        termRef.current?.focus()
      } catch {
        /* disposed */
      }
    }
  }, [focused])

  return (
    <div
      className={`dshNtPane${focused ? ' dshNtPaneFocused' : ''}`}
      onMouseDown={() => onFocus?.(paneId)}
    >
      <div className="dshNtPaneBody" ref={hostRef} />
    </div>
  )
}

/**
 * Render a layout tree into nested flex boxes with drag handles.
 *
 * Split into two components deliberately: hooks may not sit behind the
 * leaf/split branch, so the branch lives here (hook-free) and every hook lives
 * in SplitView below.
 */
function LayoutView({ node, path, onRatio, renderPane }) {
  if (node === null || node === undefined) return null
  if (node.kind === 'leaf') return renderPane(node.id)
  return <SplitView node={node} path={path} onRatio={onRatio} renderPane={renderPane} />
}

/** One split node: owns the drag handle between its two halves. */
function SplitView({ node, path, onRatio, renderPane }) {
  const isRow = node.dir === 'row'
  const containerRef = useRef(null)

  const startDrag = (event) => {
    event.preventDefault()
    const container = containerRef.current
    if (container === null) return
    const rect = container.getBoundingClientRect()

    const move = (moveEvent) => {
      const ratio = isRow
        ? (moveEvent.clientX - rect.left) / rect.width
        : (moveEvent.clientY - rect.top) / rect.height
      onRatio(path, ratio)
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={containerRef}
      className="dshNtSplit"
      style={{ flexDirection: isRow ? 'row' : 'column' }}
    >
      <div className="dshNtSplitHalf" style={{ flexGrow: node.ratio, flexBasis: 0 }}>
        <LayoutView node={node.a} path={[...path, 'a']} onRatio={onRatio} renderPane={renderPane} />
      </div>
      <div
        className={`dshNtHandle ${isRow ? 'dshNtHandleV' : 'dshNtHandleH'}`}
        onPointerDown={startDrag}
      />
      <div className="dshNtSplitHalf" style={{ flexGrow: 1 - node.ratio, flexBasis: 0 }}>
        <LayoutView node={node.b} path={[...path, 'b']} onRatio={onRatio} renderPane={renderPane} />
      </div>
    </div>
  )
}

/**
 * Tooltip text combining an action name with its current shortcut, e.g.
 * "Split right  (Ctrl+Shift+D)". The label comes from the parsed spec, so it
 * always reflects the user's configured binding rather than a hardcoded string.
 */
function hint(label, spec) {
  return spec && spec.label ? `${label}  (${spec.label})` : label
}

export function TerminalPanel({ cwd }) {
  const [open, setOpen] = useState(false)
  const [tabs, setTabs] = useState([])
  const [activeTab, setActiveTab] = useState(null)
  const [focusedPane, setFocusedPane] = useState(null)
  const [settings, setSettings] = useState(null)
  const [dockHost, setDockHost] = useState(null)
  const seatRef = useRef(null)
  const [height, setHeight] = useState(() => {
    const stored = Number(window.localStorage.getItem(HEIGHT_KEY))
    return Number.isFinite(stored) && stored >= MIN_HEIGHT ? stored : 280
  })

  /* Resolve the conversation column once our seat is in the document. */
  useEffect(() => {
    setDockHost(findDockHost(seatRef.current))
  }, [])

  const focusers = useRef(new Map())
  const registerFocuser = useCallback((paneId, fn) => {
    if (fn === null) focusers.current.delete(paneId)
    else focusers.current.set(paneId, fn)
  }, [])

  /* Load host-side settings (shortcuts, font size) once. */
  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}/config`)
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setSettings(body.settings ?? {})
      })
      .catch(() => {
        if (!cancelled) setSettings({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(HEIGHT_KEY, String(height))
  }, [height])

  const shortcuts = useMemo(() => {
    const s = settings ?? {}
    return {
      toggle: parseShortcut(s.toggleShortcut ?? 'ctrl+`'),
      newTab: parseShortcut(s.newTabShortcut ?? 'ctrl+shift+`'),
      splitRight: parseShortcut(s.splitRightShortcut ?? 'ctrl+shift+d'),
      splitDown: parseShortcut(s.splitDownShortcut ?? 'ctrl+shift+e'),
      close: parseShortcut(s.closePaneShortcut ?? 'ctrl+shift+w'),
      next: parseShortcut(s.nextPaneShortcut ?? 'ctrl+shift+]'),
      prev: parseShortcut(s.prevPaneShortcut ?? 'ctrl+shift+['),
    }
  }, [settings])

  const fontSize = settings?.fontSize ?? 12

  const activeTabObject = tabs.find((t) => t.id === activeTab) ?? null

  const addTab = useCallback(() => {
    const paneId = nextPaneId()
    const tabId = `tab-${paneId}`
    setTabs((current) => [...current, { id: tabId, root: leaf(paneId) }])
    setActiveTab(tabId)
    setFocusedPane(paneId)
    setOpen(true)
  }, [])

  const doSplit = useCallback(
    (dir) => {
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== activeTab) return tab
          const target = focusedPane ?? paneIds(tab.root)[0]
          if (target === undefined) return tab
          const newId = nextPaneId()
          queueMicrotask(() => setFocusedPane(newId))
          return { ...tab, root: splitPane(tab.root, target, dir, newId) }
        }),
      )
    },
    [activeTab, focusedPane],
  )

  const closePane = useCallback(
    (paneId) => {
      const target = paneId ?? focusedPane
      if (target === null || target === undefined) return
      setTabs((current) => {
        const next = []
        for (const tab of current) {
          if (tab.id !== activeTab) {
            next.push(tab)
            continue
          }
          const root = removePane(tab.root, target)
          if (root !== null) {
            next.push({ ...tab, root })
            queueMicrotask(() => setFocusedPane(paneIds(root)[0] ?? null))
          }
          // A tab whose last pane closed is dropped entirely.
        }
        if (next.length > 0 && next.every((t) => t.id !== activeTab)) {
          queueMicrotask(() => setActiveTab(next[next.length - 1].id))
        }
        if (next.length === 0) queueMicrotask(() => setActiveTab(null))
        return next
      })
    },
    [activeTab, focusedPane],
  )

  const movePane = useCallback(
    (direction) => {
      if (activeTabObject === null) return
      const target =
        direction === 'next'
          ? nextPane(activeTabObject.root, focusedPane)
          : prevPane(activeTabObject.root, focusedPane)
      if (target !== null) {
        setFocusedPane(target)
        focusers.current.get(target)?.()
      }
    },
    [activeTabObject, focusedPane],
  )

  const onRatio = useCallback(
    (path, ratio) => {
      setTabs((current) =>
        current.map((tab) => (tab.id === activeTab ? { ...tab, root: setRatio(tab.root, path, ratio) } : tab)),
      )
    },
    [activeTab],
  )

  /* Global shortcut handling. Capture phase so the focused xterm cannot eat them. */
  useEffect(() => {
    if (settings === null) return undefined
    const onKey = (event) => {
      const act = (fn) => {
        event.preventDefault()
        event.stopPropagation()
        fn()
      }
      if (matchesShortcut(shortcuts.toggle, event)) {
        return act(() => {
          setOpen((wasOpen) => {
            if (!wasOpen && tabs.length === 0) queueMicrotask(addTab)
            return !wasOpen
          })
        })
      }
      // The rest only apply while the panel is open.
      if (!open) return
      if (matchesShortcut(shortcuts.newTab, event)) return act(addTab)
      if (matchesShortcut(shortcuts.splitRight, event)) return act(() => doSplit('row'))
      if (matchesShortcut(shortcuts.splitDown, event)) return act(() => doSplit('column'))
      if (matchesShortcut(shortcuts.close, event)) return act(() => closePane(null))
      if (matchesShortcut(shortcuts.next, event)) return act(() => movePane('next'))
      if (matchesShortcut(shortcuts.prev, event)) return act(() => movePane('prev'))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [settings, shortcuts, open, tabs.length, addTab, doSplit, closePane, movePane])

  /* Drag the whole dock taller/shorter. */
  const startResize = (event) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    const move = (moveEvent) => {
      const next = Math.max(MIN_HEIGHT, startHeight - (moveEvent.clientY - startY))
      setHeight(Math.min(next, window.innerHeight - 120))
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  // An always-present marker: it anchors the portal lookup and stays in the
  // slot seat, occupying no space.
  const seat = <div ref={seatRef} style={{ display: 'none' }} />

  if (!open || dockHost === null) return seat

  const panel = (
    <div className="dshNtRoot" style={{ height }}>
      <div
        className="dshNtResize"
        onPointerDown={startResize}
        title="Drag to resize the terminal panel"
      />
      <div className="dshNtBar">
        <div className="dshNtTabs">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              className={`dshNtTab${tab.id === activeTab ? ' dshNtTabActive' : ''}`}
              onClick={() => {
                setActiveTab(tab.id)
                setFocusedPane(paneIds(tab.root)[0] ?? null)
              }}
              title={`Terminal ${index + 1}  (${hint('cycle panes', shortcuts.next)})`}
            >
              <span>{`Terminal ${index + 1}`}</span>
              {paneCount(tab.root) > 1 ? (
                <span className="dshNtTabCount">{paneCount(tab.root)}</span>
              ) : null}
            </button>
          ))}
          <button
            className="dshNtIconBtn"
            onClick={addTab}
            title={hint('New terminal', shortcuts.newTab)}
            aria-label={hint('New terminal', shortcuts.newTab)}
          >
            +
          </button>
        </div>
        <div className="dshNtActions">
          <div className="dshNtHelp" tabIndex={0} aria-label="Keyboard shortcuts">
            ?
            <div className="dshNtHelpCard" role="tooltip">
              <div className="dshNtHelpTitle">Keyboard shortcuts</div>
              {[
                ['Toggle panel', shortcuts.toggle],
                ['New terminal', shortcuts.newTab],
                ['Split right', shortcuts.splitRight],
                ['Split down', shortcuts.splitDown],
                ['Close pane', shortcuts.close],
                ['Next pane', shortcuts.next],
                ['Previous pane', shortcuts.prev],
              ].map(([label, spec]) => (
                <div className="dshNtHelpRow" key={label}>
                  <span>{label}</span>
                  <kbd>{spec && spec.label ? spec.label : '—'}</kbd>
                </div>
              ))}
            </div>
          </div>
          <button
            className="dshNtIconBtn"
            onClick={() => doSplit('row')}
            title={hint('Split right', shortcuts.splitRight)}
            aria-label={hint('Split right', shortcuts.splitRight)}
          >
            ▥
          </button>
          <button
            className="dshNtIconBtn"
            onClick={() => doSplit('column')}
            title={hint('Split down', shortcuts.splitDown)}
            aria-label={hint('Split down', shortcuts.splitDown)}
          >
            ▤
          </button>
          <button
            className="dshNtIconBtn"
            onClick={() => closePane(null)}
            title={hint('Close pane', shortcuts.close)}
            aria-label={hint('Close pane', shortcuts.close)}
          >
            ✕
          </button>
          <button
            className="dshNtIconBtn"
            onClick={() => setOpen(false)}
            title={hint('Hide panel', shortcuts.toggle)}
            aria-label={hint('Hide panel', shortcuts.toggle)}
          >
            ▾
          </button>
        </div>
      </div>
      <div className="dshNtBody">
        {activeTabObject === null ? (
          <div className="dshNtEmpty">
            <button
              className="dshNtEmptyBtn"
              onClick={addTab}
              title={hint('New terminal', shortcuts.newTab)}
            >
              Open a terminal
            </button>
          </div>
        ) : (
          <LayoutView
            node={activeTabObject.root}
            path={[]}
            onRatio={onRatio}
            renderPane={(paneId) => (
              <TerminalPane
                key={paneId}
                paneId={paneId}
                cwd={cwd}
                fontSize={fontSize}
                focused={paneId === focusedPane}
                onFocus={setFocusedPane}
                onExit={closePane}
                registerFocuser={registerFocuser}
              />
            )}
          />
        )}
      </div>
    </div>
  )

  return (
    <>
      {seat}
      {createPortal(panel, dockHost)}
    </>
  )
}
