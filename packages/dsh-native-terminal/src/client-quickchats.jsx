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
 * workspace — created at the host's home directory — which this UI presents
 * separately from the project list. The chats behave like normal chats (tools
 * and files work); they simply never appear under one of your projects.
 */

import React, { useCallback, useState } from 'react'

const QUICK_TITLE = 'Quick chats'
const STORE_KEY = 'dsh-native-terminal.quick-workspace'

/**
 * Normalise one workspace entry.
 *
 * The wire type is `WorkspaceView` (`workspaceId` / `sessionIds`), but the
 * sidebar snapshot may expose a richer shape with `id` / `sessions`. Accept
 * both rather than guessing one.
 */
function readWorkspace(entry) {
  if (entry === null || typeof entry !== 'object') return null
  const id = entry.workspaceId ?? entry.id
  if (id === undefined) return null
  const sessions = Array.isArray(entry.sessions)
    ? entry.sessions
    : (entry.sessionIds ?? []).map((sid) => ({ id: sid, title: undefined }))
  return { id, title: entry.title, path: entry.path, sessions }
}

export function createQuickChatsAction(services) {
  return function QuickChatsAction(props) {
    const { wide } = props
    const snapshot = props.useWorkspaces?.((s) => s) ?? []
    const [busy, setBusy] = useState(false)
    const [expanded, setExpanded] = useState(true)
    const [error, setError] = useState(null)

    const raw = Array.isArray(snapshot) ? snapshot : (snapshot?.workspaces ?? [])
    const list = raw.map(readWorkspace).filter((w) => w !== null)

    const quick = list.find((w) => w.title === QUICK_TITLE) ?? null
    const sessions = quick?.sessions ?? []

    const openNew = useCallback(async () => {
      setBusy(true)
      setError(null)
      try {
        // Read the services now, not at apply() time: this plugin activates
        // before they mount, so an eager read would pin `undefined`.
        const workspaces = services.workspaces
        const ui = services.uiWorkspace
        if (workspaces === undefined || ui === undefined) {
          throw new Error('workspace services unavailable')
        }

        let id = quick?.id ?? window.localStorage.getItem(STORE_KEY) ?? null

        // Confirm a remembered id still exists; a deleted workspace must not
        // wedge the button forever.
        if (id !== null && list.every((w) => w.id !== id)) id = null

        if (id === null) {
          // `create` registers an EXISTING path, so it needs a real directory.
          // The host resolves `~` for us via the directory picker's listing
          // root, which is the host home.
          const home = await resolveHome(services)
          const created = await workspaces.create({ path: home })
          id = created.workspaceId ?? created.id
          if (created.title !== QUICK_TITLE) {
            try {
              await workspaces.rename(id, QUICK_TITLE)
            } catch {
              /* a rename failure is cosmetic, not fatal */
            }
          }
          window.localStorage.setItem(STORE_KEY, id)
        }

        ui.startSession(id)
      } catch (err) {
        setError(String(err?.message ?? err))
      } finally {
        setBusy(false)
      }
    }, [quick, list])

    const openSession = useCallback((sessionId) => {
      services.uiWorkspace?.openSession(sessionId)
    }, [])

    if (!wide) {
      // Collapsed rail: a single compact button.
      return (
        <button
          className="dshQcRailBtn"
          onClick={openNew}
          disabled={busy}
          title={QUICK_TITLE}
          aria-label={QUICK_TITLE}
        >
          <BoltIcon />
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

/**
 * The host's home directory.
 *
 * `uiWorkspace.listDirectory()` with no path lists the host home and returns
 * its breadcrumb ancestry, which is the supported way to learn that path from
 * the browser.
 */
async function resolveHome(services) {
  const ui = services.uiWorkspace
  const listing = await ui.listDirectory()
  const direct = listing?.path ?? listing?.cwd ?? listing?.current
  if (typeof direct === 'string' && direct.length > 0) return direct
  const crumbs = listing?.breadcrumbs ?? listing?.ancestors ?? []
  const last = crumbs[crumbs.length - 1]
  const fromCrumb = typeof last === 'string' ? last : last?.path
  if (typeof fromCrumb === 'string' && fromCrumb.length > 0) return fromCrumb
  throw new Error('could not resolve the home directory')
}

/** Small lightning glyph for the collapsed rail. */
function BoltIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8.8 1.5 3.6 9.1h3.3l-.7 5.4 5.2-7.6H8.1l.7-5.4Z"
        fill="currentColor"
      />
    </svg>
  )
}
