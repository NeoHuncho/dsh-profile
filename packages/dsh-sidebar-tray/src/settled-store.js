/**
 * Durable tray state — settled conversations AND Spaces — read and written
 * through the ordinary settings Remote (`ctx.remote.settings`) against the
 * `sidebar-tray` namespace this package's host half registers.
 *
 * Why the settings document rather than localStorage: settling and spaces must
 * survive a harness restart AND be the same on every browser pointed at this
 * host. The host is the only thing both browsers share, and the settings
 * service already owns a durable, validated, restart-safe document.
 *
 * Writes go through `mutate` (path-addressed) rather than `replace`, so this
 * plugin can never delete namespace fields it did not author, and the write
 * applies against the section as it stands when it reaches the write queue.
 */

import { DEFAULT_SPACE_ID, normalizeDefaultSpace, normalizeEmoji, normalizeSpaces } from './spaces.js'

const NS = 'sidebar-tray'

const DEFAULTS = {
  settledSessionIds: [],
  shortcutsEnabled: true,
  sessionsPerWorkspace: 5,
  settledPreviewCount: 5,
  spaces: [],
  activeSpaceId: DEFAULT_SPACE_ID,
  defaultSpace: { name: 'Default', emoji: '🏠' },
}

/** Coerce an untrusted namespace value into the shape the UI relies on. */
function normalize(value) {
  const raw = value === null || typeof value !== 'object' ? {} : value
  const ids = Array.isArray(raw.settledSessionIds) ? raw.settledSessionIds : []
  const spaces = normalizeSpaces(raw.spaces)
  const active = typeof raw.activeSpaceId === 'string' ? raw.activeSpaceId : DEFAULT_SPACE_ID
  return {
    // De-duplicate defensively: a hand-edited settings document is a supported
    // input, and a duplicated id would render the same row twice.
    settledSessionIds: [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))],
    shortcutsEnabled: raw.shortcutsEnabled !== false,
    sessionsPerWorkspace: positive(raw.sessionsPerWorkspace, DEFAULTS.sessionsPerWorkspace),
    settledPreviewCount: positive(raw.settledPreviewCount, DEFAULTS.settledPreviewCount),
    spaces,
    defaultSpace: normalizeDefaultSpace(raw.defaultSpace),
    // A deleted space must never leave the sidebar pointing at nothing.
    activeSpaceId: active === DEFAULT_SPACE_ID || spaces.some((s) => s.id === active) ? active : DEFAULT_SPACE_ID,
  }
}

function positive(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : fallback
}

/**
 * Create the tray store.
 *
 * The store is optimistic: every command updates local state and notifies
 * subscribers immediately, then persists. A rejected write reloads from the
 * host so the UI cannot drift away from what is actually stored.
 *
 * @param remote - the client `remote` service (`remote.settings` namespace).
 * @returns a snapshot store with settle/unsettle and space commands.
 */
export function createSettledStore(remote) {
  let state = { ...DEFAULTS }
  let revision
  const listeners = new Set()

  const emit = () => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch (error) {
        console.error('[dsh-sidebar-tray] store listener failed', error)
      }
    }
  }

  const settings = () => remote?.settings

  /** Pull the durable value; a namespace the host has not registered is tolerated. */
  async function reload() {
    const api = settings()
    if (api?.describe === undefined) return
    try {
      const result = await api.describe()
      if (result?.ok !== true) return
      const view = (result.value?.namespaces ?? []).find((entry) => entry.ns === NS)
      if (view === undefined) return
      revision = view.revision
      const next = normalize(view.value)
      // Avoid a render storm: settings commits fan out to every consumer.
      if (JSON.stringify(next) === JSON.stringify(state)) return
      state = next
      emit()
    } catch (error) {
      console.error('[dsh-sidebar-tray] could not read tray settings', error)
    }
  }

  /** Persist a set of `[path, value]` leaf writes in one mutate call. */
  async function persist(writes) {
    const api = settings()
    if (api?.mutate === undefined) return
    try {
      const ops = writes.map(([path, value]) => ({ op: 'set', path: [path], value }))
      const result = await api.mutate(NS, ops, revision)
      if (result?.ok === true) {
        revision = result.value?.revision ?? revision
        return
      }
      // A stale revision or a validation failure: the durable document is the
      // authority, so resynchronize rather than keeping the optimistic value.
      await reload()
    } catch (error) {
      console.error('[dsh-sidebar-tray] could not persist tray settings', error)
      await reload()
    }
  }

  function write(patch) {
    state = normalize({ ...state, ...patch })
    emit()
    void persist(Object.entries(patch))
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reload,
    /** Most recently settled first, so the drawer preview shows the latest five. */
    settle(sessionId) {
      if (state.settledSessionIds.includes(sessionId)) return
      write({ settledSessionIds: [sessionId, ...state.settledSessionIds] })
    },
    unsettle(sessionId) {
      if (!state.settledSessionIds.includes(sessionId)) return
      write({ settledSessionIds: state.settledSessionIds.filter((id) => id !== sessionId) })
    },

    // ── Spaces ────────────────────────────────────────────────────────────
    setActiveSpace(spaceId) {
      if (spaceId === state.activeSpaceId) return
      write({ activeSpaceId: spaceId })
    },
    createSpace(name, emoji) {
      const trimmed = String(name ?? '').trim()
      if (trimmed === '') return undefined
      const id = `space-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      write({ spaces: [...state.spaces, { id, name: trimmed, emoji: normalizeEmoji(emoji), workspaceIds: [] }], activeSpaceId: id })
      return id
    },
    /** Rename a space; the built-in Default is renamed through `defaultSpace`. */
    renameSpace(spaceId, name) {
      const trimmed = String(name ?? '').trim()
      if (trimmed === '') return
      if (spaceId === DEFAULT_SPACE_ID) return write({ defaultSpace: { ...state.defaultSpace, name: trimmed } })
      write({ spaces: state.spaces.map((s) => (s.id === spaceId ? { ...s, name: trimmed } : s)) })
    },
    setSpaceEmoji(spaceId, emoji) {
      if (spaceId === DEFAULT_SPACE_ID) return write({ defaultSpace: { ...state.defaultSpace, emoji: normalizeEmoji(emoji, state.defaultSpace.emoji) } })
      write({ spaces: state.spaces.map((s) => (s.id === spaceId ? { ...s, emoji: normalizeEmoji(emoji, s.emoji) } : s)) })
    },
    /** Deleting a space returns its workspaces to Default (they are simply unclaimed). */
    deleteSpace(spaceId) {
      if (!state.spaces.some((s) => s.id === spaceId)) return
      write({
        spaces: state.spaces.filter((s) => s.id !== spaceId),
        activeSpaceId: state.activeSpaceId === spaceId ? DEFAULT_SPACE_ID : state.activeSpaceId,
      })
    },
    moveSpace(spaceId, direction) {
      const index = state.spaces.findIndex((s) => s.id === spaceId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= state.spaces.length) return
      const next = [...state.spaces]
      ;[next[index], next[target]] = [next[target], next[index]]
      write({ spaces: next })
    },
    /** Claim a workspace for `spaceId`; `default` (or undefined) un-claims it. */
    assignWorkspace(workspaceId, spaceId) {
      const spaces = state.spaces.map((s) => {
        const without = s.workspaceIds.filter((id) => id !== workspaceId)
        return s.id === spaceId ? { ...s, workspaceIds: [...without, workspaceId] } : { ...s, workspaceIds: without }
      })
      write({ spaces })
    },
  }
}
