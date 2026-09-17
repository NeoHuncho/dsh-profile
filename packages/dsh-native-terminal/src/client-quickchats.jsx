/**
 * dsh-native-terminal — Quick chats.
 *
 * Chats that are not filed under any project workspace, listed in their own
 * group at the sidebar foot, directly above Settings.
 *
 * Implementation note, stated plainly: DSH has no concept of a session with no
 * workspace. Every session's header carries a canonical `cwd`, and the
 * workspace registry only returns sessions whose cwd matches a workspace it
 * knows. So "not tied to a workspace" is implemented as ONE dedicated
 * workspace — rooted at the user's home directory — which this UI presents
 * separately from the project list. The chats behave like normal chats (tools
 * and files work); they simply never appear under one of your projects.
 */

import React, { useCallback, useEffect, useState } from 'react'

const QUICK_TITLE = 'Quick chats'
const STORE_KEY = 'dsh-native-terminal.quick-workspace'

/** Find the dedicated Quick-chats workspace, or create it on first use. */
async function resolveQuickWorkspace(workspaces, snapshot) {
  const remembered = window.localStorage.getItem(STORE_KEY)
  const existing = snapshot.find(
    (w) => w.id === remembered || w.title === QUICK_TITLE,
  )
  if (existing !== undefined) {
    window.localStorage.setItem(STORE_KEY, existing.id)
    return existing.id
  }

  // Create it under the user's home. The host resolves `~` itself; we ask for
  // the home directory by passing an empty path, which the controller maps to
  // the host home.
  const created = await workspaces.create({ path: '~' })
  try {
    await workspaces.rename(created.id, QUICK_TITLE)
  } catch {
    /* a rename failure is cosmetic */
  }
  window.localStorage.setItem(STORE_KEY, created.id)
  return created.id
}

export function createQuickChatsAction(services) {
  return function QuickChatsAction(props) {
  const { wide } = props
  const workspacesSnapshot = props.useWorkspaces?.((s) => s) ?? []
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [error, setError] = useState(null)

  const list = Array.isArray(workspacesSnapshot)
    ? workspacesSnapshot
    : (workspacesSnapshot?.workspaces ?? [])

  const quick = list.find((w) => w.title === QUICK_TITLE) ?? null
  const sessions = quick?.sessions ?? []

  const openNew = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const { workspaces, uiWorkspace: ui } = services
      if (workspaces === undefined || ui === undefined) {
        throw new Error('workspace services unavailable')
      }
      const id = await resolveQuickWorkspace(workspaces, list)
      ui.startSession(id)
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }, [list])

  const openSession = useCallback((sessionId) => {
    services.uiWorkspace?.openSession(sessionId)
  }, [])

  if (!wide) {
    // Rail (collapsed sidebar): a single compact button.
    return (
      <button
        className="dshQcRailBtn"
        onClick={openNew}
        disabled={busy}
        title={QUICK_TITLE}
        aria-label={QUICK_TITLE}
      >
        ⚡
      </button>
    )
  }

  return (
    <div className="dshQcRoot">
      <div className="dshQcHeader">
        <button
          className="dshQcHeaderBtn"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className={`dshQcChevron${expanded ? ' dshQcChevronOpen' : ''}`}>›</span>
          <span className="dshQcTitle">{QUICK_TITLE}</span>
        </button>
        <button
          className="dshQcNewBtn"
          onClick={openNew}
          disabled={busy}
          title="New quick chat"
          aria-label="New quick chat"
        >
          +
        </button>
      </div>
      {expanded ? (
        <div className="dshQcList">
          {sessions.length === 0 ? (
            <div className="dshQcEmpty">No quick chats yet</div>
          ) : (
            sessions.slice(0, 12).map((session) => (
              <button
                key={session.id}
                className="dshQcItem"
                onClick={() => openSession(session.id)}
                title={session.title ?? 'Untitled'}
              >
                {session.title ?? 'Untitled'}
              </button>
            ))
          )}
          {error !== null ? <div className="dshQcError">{error}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
}
