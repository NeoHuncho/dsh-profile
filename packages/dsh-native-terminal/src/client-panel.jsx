/**
 * dsh-native-terminal — the bottom terminal panel.
 *
 * Renders a resizable dock below the conversation, holding tabs of split
 * panes. Each pane is an xterm.js instance bound to one host PTY session over
 * a WebSocket.
 *
 * xterm.js is pure JavaScript, so nothing here pulls a native module into the
 * page or the host process.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** Theme the terminal from the app's own CSS variables, so it follows light/dark. */
function readTheme() {
  if (typeof window === 'undefined') return {}
  const styles = getComputedStyle(document.documentElement)
  const pick = (name, fallback) => {
    const value = styles.getPropertyValue(name).trim()
    return value.length > 0 ? value : fallback
  }
  return {
    background: pick('--dsw-alias-bg-l1', '#1e1e1e'),
    foreground: pick('--dsw-alias-label-primary', '#d4d4d4'),
    cursor: pick('--dsw-alias-label-primary', '#d4d4d4'),
    selectionBackground: pick('--dsw-alias-fill-l2', 'rgba(255,255,255,0.25)'),
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
      fontFamily:
        'var(--dsw-font-mono), Menlo, Monaco, "Cascadia Mono", "Courier New", monospace',
      cursorBlink: true,
      allowProposedApi: true,
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
    }

    void connect()

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

export function TerminalPanel({ cwd }) {
  const [open, setOpen] = useState(false)
  const [tabs, setTabs] = useState([])
  const [activeTab, setActiveTab] = useState(null)
  const [focusedPane, setFocusedPane] = useState(null)
  const [settings, setSettings] = useState(null)
  const [height, setHeight] = useState(() => {
    const stored = Number(window.localStorage.getItem(HEIGHT_KEY))
    return Number.isFinite(stored) && stored >= MIN_HEIGHT ? stored : 280
  })

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

  if (!open) return null

  return (
    <div className="dshNtRoot" style={{ height }}>
      <div className="dshNtResize" onPointerDown={startResize} />
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
              title={`Terminal ${index + 1}`}
            >
              <span>{`Terminal ${index + 1}`}</span>
              {paneCount(tab.root) > 1 ? (
                <span className="dshNtTabCount">{paneCount(tab.root)}</span>
              ) : null}
            </button>
          ))}
          <button className="dshNtIconBtn" onClick={addTab} title="New terminal">
            +
          </button>
        </div>
        <div className="dshNtActions">
          <button className="dshNtIconBtn" onClick={() => doSplit('row')} title="Split right">
            ▥
          </button>
          <button className="dshNtIconBtn" onClick={() => doSplit('column')} title="Split down">
            ▤
          </button>
          <button className="dshNtIconBtn" onClick={() => closePane(null)} title="Close pane">
            ✕
          </button>
          <button className="dshNtIconBtn" onClick={() => setOpen(false)} title="Hide panel">
            ▾
          </button>
        </div>
      </div>
      <div className="dshNtBody">
        {activeTabObject === null ? (
          <div className="dshNtEmpty">
            <button className="dshNtEmptyBtn" onClick={addTab}>
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
}
