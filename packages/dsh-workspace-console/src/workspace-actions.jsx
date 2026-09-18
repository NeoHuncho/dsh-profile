import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { matchesShortcut, parseShortcut } from './shortcut.js'
import { requestTerminalAction } from './terminal-actions.js'

const ACTIONS_BASE = '/native-terminal/actions'
const SAFE_SHORTCUTS = ['ctrl+shift+k d', 'ctrl+shift+k t', 'ctrl+shift+k b', 'ctrl+shift+k p']

function isEditable(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

function splitChord(value) {
  if (typeof value !== 'string') return null
  const parts = value.trim().split(/\s+/)
  if (parts.length !== 2) return null
  const first = parseShortcut(parts[0])
  const second = parseShortcut(parts[1])
  return first && second ? { first, second, label: `${first.label} then ${second.label}` } : null
}

function useWorkspaceActions(cwd) {
  const [state, setState] = useState({ actions: [], loading: false, error: '' })
  const load = async () => {
    if (!cwd) return setState({ actions: [], loading: false, error: '' })
    setState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const response = await fetch(`${ACTIONS_BASE}?cwd=${encodeURIComponent(cwd)}`, { headers: { accept: 'application/json' } })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
      setState({ actions: Array.isArray(body.actions) ? body.actions : [], loading: false, error: '' })
    } catch (error) {
      setState({ actions: [], loading: false, error: String(error?.message ?? error) })
    }
  }
  useEffect(() => { void load() }, [cwd])
  return [state, load]
}

function ActionEditor({ cwd, actions, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => actions.map((action) => ({ ...action })))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const update = (index, field, value) => setDraft((current) => current.map((item, i) => i === index ? { ...item, [field]: value } : item))
  const remove = (index) => setDraft((current) => current.filter((_, i) => i !== index))
  const add = () => setDraft((current) => [...current, { id: `action-${current.length + 1}`, name: '', command: '', icon: 'run', shortcut: '' }])
  const save = async () => {
    setSaving(true); setError('')
    try {
      const response = await fetch(ACTIONS_BASE, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cwd, actions: draft }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
      await onSaved(); onClose()
    } catch (reason) { setError(String(reason?.message ?? reason)) } finally { setSaving(false) }
  }
  return createPortal(
    <div className="dshWaBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dshWaEditor" role="dialog" aria-modal="true" aria-labelledby="dsh-wa-title">
        <header><div><h2 id="dsh-wa-title">Workspace actions</h2><p>Saved in <code>.agents/actions.json</code> in this workspace.</p></div><button onClick={onClose} aria-label="Close">×</button></header>
        <div className="dshWaRows">
          {draft.map((action, index) => <fieldset key={`${action.id}-${index}`} className="dshWaRow">
            <legend>Action {index + 1}</legend>
            <label>Name<input value={action.name} onChange={(e) => update(index, 'name', e.target.value)} placeholder="Start dev server" /></label>
            <label>Command<input value={action.command} onChange={(e) => update(index, 'command', e.target.value)} placeholder="npm run dev" /></label>
            <label>Shortcut<input value={action.shortcut || ''} onChange={(e) => update(index, 'shortcut', e.target.value)} placeholder="ctrl+shift+k d" /></label>
            <label>Icon<input value={action.icon || 'run'} onChange={(e) => update(index, 'icon', e.target.value)} placeholder="run" /></label>
            <button className="dshWaDanger" onClick={() => remove(index)}>Remove</button>
          </fieldset>)}
          {draft.length === 0 ? <p className="dshWaEmpty">No actions yet. Add the first workspace action.</p> : null}
        </div>
        <div className="dshWaAdvice"><strong>Safe shortcut pattern:</strong> use a two-step chord beginning with <kbd>Ctrl+Shift+K</kbd>, then a letter. Suggestions: {SAFE_SHORTCUTS.map((item) => <kbd key={item}>{item}</kbd>)}</div>
        {error ? <div className="dshWaError" role="alert">{error}</div> : null}
        <footer><button onClick={add}>+ Add action</button><span /><button onClick={onClose}>Cancel</button><button className="dshWaPrimary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save actions'}</button></footer>
      </section>
    </div>, document.body)
}

export function WorkspaceActions({ sessionId, useSessions, cwd: explicitCwd, variant = 'header' }) {
  const storeCwd = useSessions?.((state) => state?.byId?.[sessionId]?.cwd)
  const cwd = explicitCwd || storeCwd
  const [state, reload] = useWorkspaceActions(cwd)
  const [editing, setEditing] = useState(false)
  const [leader, setLeader] = useState(null)
  const chords = useMemo(() => state.actions.map((action) => ({ action, chord: splitChord(action.shortcut) })).filter((item) => item.chord), [state.actions])

  useEffect(() => {
    if (!cwd || chords.length === 0) return undefined
    let pending = null
    let timer = null
    const clear = () => { pending = null; clearTimeout(timer); timer = null; setLeader(null) }
    const onKeyDown = (event) => {
      if (event.isComposing || event.repeat) return
      if (event.code === 'Escape') return clear()
      if (pending) {
        const match = chords.find((item) => item.chord.first.label === pending && matchesShortcut(item.chord.second, event))
        if (match) {
          event.preventDefault(); event.stopPropagation(); clear()
          requestTerminalAction({ ...match.action, cwd })
        }
        return
      }
      if (isEditable(event.target) && !event.ctrlKey && !event.metaKey) return
      const match = chords.find((item) => matchesShortcut(item.chord.first, event))
      if (!match) return
      event.preventDefault(); event.stopPropagation()
      pending = match.chord.first.label
      setLeader(pending)
      timer = window.setTimeout(clear, 1800)
    }
    const onKeyUp = (event) => {
      if (pending && chords.some((item) => item.chord.first.code === event.code)) setLeader(pending)
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', clear)
    return () => { clear(); window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('keyup', onKeyUp, true); window.removeEventListener('blur', clear) }
  }, [cwd, chords])

  if (!cwd) return null
  return <>
    <div className={`dshWorkspaceActions dshWorkspaceActions-${variant}`} role="group" aria-label="Workspace actions">
      {state.actions.map((action) => <button key={action.id} type="button" className="dshWorkspaceAction" title={`${action.name} — ${action.command}${action.shortcut ? ` (${action.shortcut})` : ''}`} onClick={() => requestTerminalAction({ ...action, cwd })}>
        <span className="dshWorkspaceActionIcon" aria-hidden="true">{action.icon === 'run' ? '▶' : action.icon}</span><span>{action.name}</span>{action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
      </button>)}
      <button type="button" className="dshWorkspaceAction dshWorkspaceActionEdit" onClick={() => setEditing(true)} title="Add or edit workspace actions">{state.actions.length ? '•••' : '+ Add action'}</button>
    </div>
    {editing ? <ActionEditor cwd={cwd} actions={state.actions} onClose={() => setEditing(false)} onSaved={reload} /> : null}
    {leader ? createPortal(<div className="dshWaChordOverlay" role="status" aria-live="polite"><strong>{leader}</strong><span>Choose an action</span>{chords.filter((item) => item.chord.first.label === leader).map(({ action, chord }) => <button key={action.id} onClick={() => { setLeader(null); requestTerminalAction({ ...action, cwd }) }}><kbd>{chord.second.label}</kbd>{action.name}</button>)}</div>, document.body) : null}
    {state.error ? <span className="dshWaInlineError" title={state.error}>Actions unavailable</span> : null}
  </>
}
