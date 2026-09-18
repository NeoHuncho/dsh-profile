/**
 * Browser-side view of worktree environments.
 *
 * One shared poller talks to the host's `/native-terminal/envs` routes and
 * publishes:
 *   - a snapshot (`projects`, `envs`) for React consumers via useSyncExternalStore
 *   - `window.__dshEnvParents__` = { childWorkspaceId: parentWorkspaceId } plus a
 *     `dsh-env-registry` window event, which is how the sidebar tray (a separate
 *     package with no shared client service) nests env workspaces and keeps
 *     them in their parent's Space.
 *   - `window.__dshEnv__` = { createForWorkspace, isEnvProject } so the tray can
 *     route "new conversation" on an env-enabled project through a fresh
 *     worktree without importing this package.
 */

const BASE = '/native-terminal/envs'

let snapshot = { revision: 0, projects: {}, envs: [], loaded: false, error: '' }
const listeners = new Set()
let timer = null
let inflight = null

function emit() {
  for (const listener of [...listeners]) {
    try { listener() } catch (error) { console.error('[workspace-console] env listener failed', error) }
  }
}

function publishParents() {
  const parents = {}
  for (const env of snapshot.envs) {
    if (env.childWorkspaceId && env.state !== 'torn-down') parents[env.childWorkspaceId] = env.parentWorkspaceId
  }
  const before = JSON.stringify(window.__dshEnvParents__ ?? {})
  window.__dshEnvParents__ = parents
  if (before !== JSON.stringify(parents)) window.dispatchEvent(new Event('dsh-env-registry'))
}

async function request(path, init) {
  const response = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json', 'content-type': 'application/json' }, ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

export async function refreshEnvs() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const body = await request('')
      snapshot = { revision: body.revision, projects: body.projects ?? {}, envs: body.envs ?? [], loaded: true, error: '' }
    } catch (error) {
      snapshot = { ...snapshot, loaded: true, error: String(error?.message ?? error) }
    } finally {
      inflight = null
    }
    publishParents()
    emit()
    return snapshot
  })()
  return inflight
}

function schedule() {
  if (timer !== null) return
  timer = window.setInterval(() => { if (listeners.size > 0) void refreshEnvs() }, 5000)
}

export const envStore = {
  getSnapshot: () => snapshot,
  subscribe(listener) {
    listeners.add(listener)
    schedule()
    if (!snapshot.loaded) void refreshEnvs()
    return () => listeners.delete(listener)
  },
  /** Environment whose worktree is `cwd` (or whose child workspace is `workspaceId`). */
  envFor({ cwd, workspaceId }) {
    return snapshot.envs.find((env) => env.state !== 'torn-down' && ((cwd && env.dir === cwd) || (workspaceId && env.childWorkspaceId === workspaceId)))
  },
  /** Torn-down env for a session's original worktree path, restorable. */
  tornDownFor(cwd) {
    return snapshot.envs.find((env) => env.state === 'torn-down' && env.dir === cwd)
  },
  isEnvProject(workspaceId) {
    return snapshot.projects[workspaceId] !== undefined && snapshot.projects[workspaceId].error === undefined
  },
  async createForWorkspace(workspaceId) {
    const body = await request('', { method: 'POST', body: JSON.stringify({ workspaceId }) })
    await refreshEnvs()
    return body.env
  },
  async act(envId, action) {
    const body = await request(`/${envId}/${action}`, { method: 'POST' })
    await refreshEnvs()
    return body.env
  },
  async log(envId) {
    return (await request(`/${envId}/log?lines=200`)).log
  },
}

/** Install the cross-package bridge; returns a disposer. */
export function installEnvBridge() {
  window.__dshEnv__ = {
    isEnvProject: (id) => envStore.isEnvProject(id),
    envForWorkspace: (id) => envStore.envFor({ workspaceId: id }),
    envForCwd: (cwd) => envStore.envFor({ cwd }),
    tornDownFor: (cwd) => envStore.tornDownFor(cwd),
    createForWorkspace: (id) => envStore.createForWorkspace(id),
    act: (id, action) => envStore.act(id, action),
    refresh: () => refreshEnvs(),
  }
  const off = envStore.subscribe(() => {})
  return () => {
    off()
    delete window.__dshEnv__
    if (timer !== null && listeners.size === 0) { clearInterval(timer); timer = null }
  }
}
