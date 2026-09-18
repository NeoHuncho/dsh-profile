/**
 * dsh-model-shortcuts — client entry.
 *
 * Two keyboard shortcuts open two pickers, and each entry in a picker has a
 * number key:
 *
 *   Ctrl+Shift+M  → model picker      (1-9 selects, Esc closes)
 *   Ctrl+Shift+L  → effort picker     (1-9 selects, Esc closes)
 *
 * Selection rides the SAME per-session `ModelDirectory` that the composer's
 * model seat and the /model popup use (`ctx.modelDirectories.directoryFor`),
 * so a switch made here updates the composer trigger immediately and is
 * submitted through the one shipped `session.selectModel` path. This plugin
 * owns no selection state of its own.
 *
 * It registers additively into `conversation.input.overlay` and replaces no
 * shipped UI: the model seat keeps working exactly as before.
 */

import React from 'react'

import { matchesShortcut, parseShortcut } from './shortcut.js'
import pickerCss from './picker.css?raw'

/**
 * Hard dependencies. `modelDirectories` is the shared per-session selection
 * service; without it there is nothing to drive, so waiting is correct.
 */
export const inject = ['slots', 'modelDirectories', 'sessions']

/**
 * Each action accepts SEVERAL bindings, tried in order.
 *
 * This is not redundancy for its own sake: a page cannot observe a chord the
 * browser or OS consumes first, and which chords those are varies by browser,
 * platform and user config. Ctrl+Shift+M is the natural mnemonic for "model"
 * but is claimed in common setups (Chrome's profile switcher, Firefox's
 * responsive-design mode), where it never reaches page JavaScript at all. A
 * single stolen chord must not leave the feature unreachable, so each action
 * also has an alternate that no common browser claims.
 *
 * Ctrl+Shift+E is deliberately absent: the terminal panel binds it.
 */
const DEFAULTS = {
  modelShortcuts: ['ctrl+shift+m', 'ctrl+shift+k'],
  effortShortcuts: ['ctrl+shift+l', 'ctrl+shift+u'],
  numberSelect: true,
}

/**
 * Parse a list of binding strings, dropping unparseable entries. An empty
 * result falls back to `fallback` so an action always has at least one chord.
 */
function parseBindings(inputs, fallback) {
  const specs = (Array.isArray(inputs) ? inputs : [])
    .map((entry) => parseShortcut(entry))
    .filter((spec) => spec !== null)
  if (specs.length > 0) return specs
  return fallback.map((entry) => parseShortcut(entry)).filter((spec) => spec !== null)
}

/** Does the event match any binding in the list? */
function matchesAny(specs, event) {
  for (const spec of specs) {
    if (matchesShortcut(spec, event)) return true
  }
  return false
}

/** Inject the stylesheet once, tagged for easy identification in devtools. */
function installStyles(css) {
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector('style[data-dsh-model-shortcuts]') !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.dshModelShortcuts = 'picker'
  tag.textContent = css
  document.head.appendChild(tag)
  return () => tag.remove()
}

export function apply(ctx) {
  ctx.effect(() => installStyles(pickerCss), 'model-shortcuts: styles')

  // Preferences, in a store the component subscribes to. Mutating a plain
  // object here would NOT re-render: a late change would land silently and the
  // user would keep the old bindings with no way to tell.
  //
  // localStorage is the source of truth, NOT the host route. Deliberately:
  // the host plugin instance is pinned for the life of the `dsh web` process,
  // so a shortcut read from it cannot be corrected without a full restart —
  // which would kill every live agent. The bindings are pure browser-side
  // behaviour and nothing on the host consumes them, so the browser owns them
  // and a change takes effect on reload.
  const prefsStore = createPrefsStore()

  ctx.slots.inject('conversation.input.overlay', () =>
    ctx.slots.register(
      { name: 'conversation.input.overlay', id: 'model-shortcuts', order: 120 },
      (props) => (
        <ModelShortcuts
          ctx={ctx}
          prefsStore={prefsStore}
          sessionId={props?.sessionId}
        />
      ),
    ),
  )
}

/** Browser storage key holding user overrides for the two bindings. */
const PREFS_KEY = 'dsh-model-shortcuts:prefs'

/**
 * Read overrides from localStorage, keeping only keys we know and values of the
 * right type. Anything malformed is ignored rather than allowed to disable a
 * shortcut, which would be indistinguishable from the feature not being
 * installed.
 */
function readStoredPrefs() {
  const value = { ...DEFAULTS }
  if (typeof localStorage === 'undefined') return value
  let incoming
  try {
    incoming = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
  } catch {
    return value
  }
  if (incoming === null || typeof incoming !== 'object') return value
  // Accept a single string or a list, so an override may add a binding without
  // having to know the multi-binding shape.
  const model = toBindingList(incoming.modelShortcut ?? incoming.modelShortcuts)
  const effort = toBindingList(incoming.effortShortcut ?? incoming.effortShortcuts)
  if (model !== null) value.modelShortcuts = model
  if (effort !== null) value.effortShortcuts = effort
  if (typeof incoming.numberSelect === 'boolean') value.numberSelect = incoming.numberSelect
  return value
}

/** Normalize a string or string array of bindings; null when unusable. */
function toBindingList(input) {
  if (typeof input === 'string') return [input]
  if (!Array.isArray(input)) return null
  const out = input.filter((entry) => typeof entry === 'string')
  return out.length > 0 ? out : null
}

/** Tiny uSES-compatible store holding the effective preferences. */
function createPrefsStore() {
  let value = readStoredPrefs()
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      // Another tab changing the bindings applies here too.
      const onStorage = (event) => {
        if (event.key !== null && event.key !== PREFS_KEY) return
        value = readStoredPrefs()
        for (const fn of listeners) fn()
      }
      if (listeners.size === 1 && typeof window !== 'undefined') {
        window.addEventListener('storage', onStorage)
      }
      return () => {
        listeners.delete(listener)
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
      }
    },
  }
}

function ModelShortcuts({ ctx, prefsStore, sessionId }) {
  const prefs = React.useSyncExternalStore(prefsStore.subscribe, prefsStore.getSnapshot)
  const sessionList = ctx.sessions.list
  const subscribeSessionList = React.useCallback(
    (listener) => sessionList.subscribe(listener),
    [sessionList],
  )
  const getSessionSnapshot = React.useCallback(
    () => sessionList.getSnapshot(),
    [sessionList],
  )
  const sessionState = React.useSyncExternalStore(
    subscribeSessionList,
    getSessionSnapshot,
    getSessionSnapshot,
  )
  const effectiveSessionId = sessionId ?? sessionState?.current ?? null
  const sessionPhase = sessionState?.phase
  const [mode, setMode] = React.useState(null)
  const [cursor, setCursor] = React.useState(0)
  const [directory, setDirectory] = React.useState(null)

  // Session-scoped slot content can render before the session binding has been
  // installed during a full-page reload. `directoryFor()` quite correctly
  // throws in that small window, but caching that failed lookup in `useMemo`
  // left the keyboard listener permanently disabled until some unrelated
  // navigation happened to re-render this component. Keep the lookup lazy and
  // retry it from the key path; the model service itself remains the sole owner
  // of the directory instance.
  const resolveDirectory = React.useCallback(() => {
    if (!effectiveSessionId) return null
    try {
      const next = ctx.modelDirectories.directoryFor(effectiveSessionId)
      setDirectory((current) => (current === next ? current : next))
      return next
    } catch {
      // The session may still be settling after reload. The next render or
      // shortcut press will retry without making the feature permanently inert.
      return null
    }
  }, [ctx, effectiveSessionId])

  React.useEffect(() => {
    setDirectory(null)
    resolveDirectory()
  }, [resolveDirectory, effectiveSessionId, sessionPhase])

  const subscribeDirectory = React.useCallback(
    (listener) => (directory ? directory.store.subscribe(listener) : () => {}),
    [directory],
  )
  const getDirectorySnapshot = React.useCallback(
    () => (directory ? directory.store.getSnapshot() : null),
    [directory],
  )
  const state = React.useSyncExternalStore(
    subscribeDirectory,
    getDirectorySnapshot,
    getDirectorySnapshot,
  )

  // ── derived option lists ──────────────────────────────────────────────────

  const models = React.useMemo(() => {
    if (state === null) return []
    const out = []
    for (const group of state.groups) {
      for (const model of group.models) {
        out.push({
          provider: group.id,
          providerName: group.name,
          id: model.id,
          name: model.name,
          reasoning: model.reasoning,
        })
      }
    }
    return out
  }, [state])

  const current = state?.current ?? null

  const efforts = React.useMemo(() => {
    if (current === null) return []
    const entry = models.find((m) => m.provider === current.provider && m.id === current.model)
    return entry?.reasoning?.efforts ?? []
  }, [models, current])

  const options = React.useMemo(() => {
    if (mode === 'model') {
      return models.map((m) => ({
        key: `${m.provider}/${m.id}`,
        name: m.name,
        note: m.providerName,
        active: current !== null && current.provider === m.provider && current.model === m.id,
        selection: {
          provider: m.provider,
          model: m.id,
          ...(m.reasoning?.defaultEffort ? { reasoningEffort: m.reasoning.defaultEffort } : {}),
        },
      }))
    }
    if (mode === 'effort') {
      return efforts.map((e) => ({
        key: e.id,
        name: e.name,
        note: e.description ?? '',
        active: current !== null && current.reasoningEffort === e.id,
        selection:
          current === null
            ? null
            : { provider: current.provider, model: current.model, reasoningEffort: e.id },
      }))
    }
    return []
  }, [mode, models, efforts, current])

  const close = React.useCallback(() => setMode(null), [])

  const choose = React.useCallback(
    (index) => {
      const activeDirectory = directory ?? resolveDirectory()
      const option = options[index]
      if (option === undefined || option.selection === null || activeDirectory === null) return
      activeDirectory.select(option.selection).catch(() => {
        // The shared directory raises its own failure surface on the composer.
      })
      close()
    },
    [options, directory, resolveDirectory, close],
  )

  // Opening a picker resets the keyboard cursor onto the current value.
  const open = React.useCallback(
    (next) => {
      const activeDirectory = directory ?? resolveDirectory()
      if (activeDirectory === null) return
      // Loading is intentionally best-effort here: the directory store exposes
      // the loading/error state to the picker, while a rejected promise must
      // not become an unhandled rejection from a keyboard press.
      activeDirectory.load().catch(() => {})
      setMode((prev) => (prev === next ? null : next))
      setCursor(0)
    },
    [directory, resolveDirectory],
  )

  React.useEffect(() => {
    if (mode === null) return
    const index = options.findIndex((o) => o.active)
    if (index >= 0) setCursor(index)
  }, [mode, options])

  // ── key handling ──────────────────────────────────────────────────────────

  // An unparseable binding falls back to this plugin's own default rather than
  // silently disabling that shortcut, which would look exactly like the feature
  // not being installed at all.
  // Unparseable entries are dropped; if that empties a list we fall back to the
  // built-in defaults rather than silently disabling the action, which would be
  // indistinguishable from the feature not being installed.
  const modelSpecs = React.useMemo(
    () => parseBindings(prefs.modelShortcuts, DEFAULTS.modelShortcuts),
    [prefs.modelShortcuts],
  )
  const effortSpecs = React.useMemo(
    () => parseBindings(prefs.effortShortcuts, DEFAULTS.effortShortcuts),
    [prefs.effortShortcuts],
  )

  React.useEffect(() => {
    const onKey = (event) => {
      if (matchesAny(modelSpecs, event)) {
        event.preventDefault()
        event.stopPropagation()
        open('model')
        return
      }
      if (matchesAny(effortSpecs, event)) {
        event.preventDefault()
        event.stopPropagation()
        open('effort')
        return
      }
      if (mode === null) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setCursor((c) => {
          const size = options.length
          if (size === 0) return 0
          return (c + delta + size) % size
        })
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        choose(cursor)
        return
      }
      // While the picker is open, number selection owns 1-9 even if the
      // composer still has focus. Prevent insertion into the focused input.
      if (
        prefs.numberSelect &&
        /^[1-9]$/.test(event.key) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.isComposing
      ) {
        event.preventDefault()
        event.stopPropagation()
        choose(Number(event.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [
    modelSpecs,
    effortSpecs,
    mode,
    options,
    cursor,
    choose,
    close,
    open,
    prefs.numberSelect,
  ])

  if (mode === null) return null

  const title = mode === 'model' ? 'Switch model' : 'Reasoning effort'
  // Show the binding actually in force, so a changed or overridden shortcut is
  // visible rather than something the user has to rediscover by trial.
  // Show every binding that works, so a chord swallowed by the browser does not
  // leave the user believing the feature is broken.
  const binding = (mode === 'model' ? modelSpecs : effortSpecs)
    .map((spec) => spec.label)
    .join(' / ')
  const keys = prefs.numberSelect ? 'press 1–9 · Esc' : '↑↓ · Enter · Esc'
  const hint = binding ? `${binding} · ${keys}` : keys

  let body
  if (options.length > 0) {
    body = options.map((option, index) => (
      <button
        key={option.key}
        type="button"
        className="dsh-ms-row"
        data-active={index === cursor ? 'true' : 'false'}
        onMouseEnter={() => setCursor(index)}
        onClick={() => choose(index)}
      >
        <span className="dsh-ms-num">{index < 9 ? index + 1 : '·'}</span>
        <span className="dsh-ms-copy">
          <span className="dsh-ms-name">{option.name}</span>
          {option.note ? <span className="dsh-ms-note">{option.note}</span> : null}
        </span>
        {option.active ? <span className="dsh-ms-check">✓</span> : null}
      </button>
    ))
  } else if (state?.status === 'loading') {
    body = <div className="dsh-ms-status">Loading…</div>
  } else if (mode === 'effort') {
    body = <div className="dsh-ms-status">This model exposes no reasoning effort levels.</div>
  } else {
    body = <div className="dsh-ms-status">No models available.</div>
  }

  return (
    <div className="dsh-ms-overlay" role="presentation" onClick={close}>
      <div
        className="dsh-ms-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dsh-ms-head">
          <span className="dsh-ms-title">{title}</span>
          <span className="dsh-ms-hint">{hint}</span>
        </div>
        <div className="dsh-ms-list">{body}</div>
      </div>
    </div>
  )
}
