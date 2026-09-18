/**
 * Spaces — pure derivations, no React, no I/O.
 *
 * A Space is a named group of workspaces (Arc/Zen style). The built-in Default
 * space is virtual: it owns every workspace that no user-created space claims,
 * so it never needs storing and can never be deleted.
 */

export const DEFAULT_SPACE_ID = 'default'
export const DEFAULT_SPACE_NAME = 'Default'

/** Coerce an untrusted `spaces` value into a clean array of spaces. */
export function normalizeSpaces(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue
    const id = typeof entry.id === 'string' ? entry.id : ''
    if (id === '' || id === DEFAULT_SPACE_ID || seen.has(id)) continue
    seen.add(id)
    const workspaceIds = Array.isArray(entry.workspaceIds)
      ? [...new Set(entry.workspaceIds.filter((w) => typeof w === 'string' && w.length > 0))]
      : []
    out.push({ id, name: typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name : 'Space', workspaceIds })
  }
  return out
}

/**
 * The full ordered space list as rendered: Default first, then user spaces.
 * Each entry carries the workspaces (in registry order) that belong to it.
 *
 * @param spaces - stored user spaces.
 * @param workspaces - host workspaces in display order.
 * @param options.parentOf - optional `(workspace) => parentWorkspaceId | undefined`,
 *   so environment child workspaces follow their parent's space.
 */
export function deriveSpaces(spaces, workspaces, options = {}) {
  const claimed = new Map()
  for (const space of spaces) {
    for (const id of space.workspaceIds) if (!claimed.has(id)) claimed.set(id, space.id)
  }
  const spaceOf = (workspace) => {
    const direct = claimed.get(workspace.workspaceId)
    if (direct !== undefined) return direct
    const parent = options.parentOf?.(workspace)
    if (parent !== undefined && claimed.has(parent)) return claimed.get(parent)
    return DEFAULT_SPACE_ID
  }

  const buckets = new Map([[DEFAULT_SPACE_ID, []]])
  for (const space of spaces) buckets.set(space.id, [])
  for (const workspace of workspaces) buckets.get(spaceOf(workspace)).push(workspace)

  return [
    { id: DEFAULT_SPACE_ID, name: DEFAULT_SPACE_NAME, builtin: true, workspaces: buckets.get(DEFAULT_SPACE_ID) },
    ...spaces.map((space) => ({ id: space.id, name: space.name, builtin: false, workspaces: buckets.get(space.id) })),
  ]
}

/** Which space a workspace is shown under (Default when unclaimed). */
export function spaceOfWorkspace(spaces, workspaceId) {
  return spaces.find((space) => space.workspaceIds.includes(workspaceId))?.id ?? DEFAULT_SPACE_ID
}

/** Short badge text for the collapsed rail: up to two initials. */
export function spaceInitials(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
