/**
 * Session-tree derivation for the tray.
 *
 * This mirrors the shipped ui-workspace derivation semantics deliberately —
 * same visibility rules, same grouping, same recency tiebreak — and adds the
 * two facts this plugin owns:
 *
 *  - settled sessions are excluded from the groups AND from search results;
 *  - each group is capped at `perGroup` visible rows unless the group has been
 *    expanded past the cap ("Show more"), which is what makes the Ctrl+Shift
 *    numbering land on exactly the rows a user can actually see.
 */

export const UNGROUPED_KEY = ''

/** Basename of a host path, both separators accepted. */
export function workspaceLabel(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return ''
  const parts = cwd.split(/[\\/]/).filter((part) => part.length > 0)
  return parts.length > 0 ? parts[parts.length - 1] : cwd
}

/** Newest first; id breaks ties so the order is stable across renders. */
function byRecency(a, b) {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
  return a.id < b.id ? -1 : 1
}

/**
 * Ordinary sessions are visible. Subagent children belong to their parent's
 * catalog, archived and settled sessions are hidden, and a blank session shows
 * only while it is the selected provisional New Session row.
 */
function visible(session, current, archived, settled) {
  if (session === undefined) return false
  if (session.origin === 'subagent') return false
  if (archived.has(session.id)) return false
  if (settled.has(session.id)) return false
  return !session.blank || session.id === current
}

/** Running descendants reached through uninterrupted subagent lineage. */
function indexSubagentDescendants(byId) {
  const indexed = new Map()
  for (const descendant of Object.values(byId)) {
    if (descendant.origin !== 'subagent') continue
    const seen = new Set()
    let current = descendant
    while (current?.origin === 'subagent' && current.parentId !== undefined && !seen.has(current.id)) {
      seen.add(current.id)
      const aggregate = indexed.get(current.parentId)
      if (aggregate === undefined) {
        indexed.set(current.parentId, { runningCount: descendant.running ? 1 : 0 })
      } else if (descendant.running) {
        aggregate.runningCount += 1
      }
      current = byId[current.parentId]
    }
  }
  return indexed
}

function hasActiveSchedule(session) {
  return (session.projectionValues?.schedule?.length ?? 0) > 0
}

function pendingKind(kind) {
  return kind === 'approval' || kind === 'plan-review' || kind === 'question' ? kind : undefined
}

function sessionNode(summary, descendants, pendingInteractions) {
  const pending = pendingKind(pendingInteractions?.get?.(summary.id)?.kind)
  return {
    id: summary.id,
    title: summary.blank ? '' : summary.displayTitle,
    blank: summary.blank === true,
    running: summary.running === true,
    runningSubagentCount: descendants.get(summary.id)?.runningCount ?? 0,
    completed: summary.completed === true,
    hasActiveSchedule: hasActiveSchedule(summary),
    updatedAt: summary.updatedAt ?? 0,
    ...(pending === undefined ? {} : { pendingInteraction: pending }),
  }
}

/** The workspace that accounts for a session, or the ungrouped bucket. */
export function owningGroupKey(workspaces, sessionId) {
  return workspaces.find((workspace) => workspace.sessionIds.includes(sessionId))?.workspaceId ?? UNGROUPED_KEY
}

/**
 * Derive the workspace groups.
 *
 * @param list - session list snapshot.
 * @param workspaces - host workspaces in display order.
 * @param archivedSessionIds - registry-global archive set.
 * @param settledSessionIds - this plugin's settled set.
 * @param pendingInteractions - pending UI interactions by session.
 * @param view - `{ expandedGroups, shownGroups, perGroup }` local view state.
 * @returns group sections in render order, each carrying its visible rows.
 */
export function deriveGroups(list, workspaces, archivedSessionIds, settledSessionIds, pendingInteractions, view) {
  const archived = new Set(archivedSessionIds ?? [])
  const settled = new Set(settledSessionIds ?? [])
  const expanded = new Set(view.expandedGroups ?? [])
  const shownAll = new Set(view.shownGroups ?? [])
  const perGroup = view.perGroup ?? 5
  const descendants = indexSubagentDescendants(list.byId ?? {})
  const currentGroup = list.current === undefined ? undefined : owningGroupKey(workspaces, list.current)

  const accounted = new Set()
  const groups = []

  for (const workspace of workspaces) {
    const members = []
    for (const id of workspace.sessionIds) {
      const summary = list.byId?.[id]
      if (summary === undefined) continue
      accounted.add(id)
      if (!visible(summary, list.current, archived, settled)) continue
      members.push(summary)
    }
    groups.push(
      buildGroup({
        key: workspace.workspaceId,
        workspaceId: workspace.workspaceId,
        cwd: workspace.path,
        label: workspace.title,
        members,
        // Workspace membership is a user-arranged order; do not re-sort it.
        sort: false,
        descendants,
        pendingInteractions,
        expanded: expanded.has(workspace.workspaceId),
        showAll: shownAll.has(workspace.workspaceId),
        perGroup,
        containsCurrent: workspace.workspaceId === currentGroup,
      }),
    )
  }

  // Sessions no listed workspace accounts for. When the caller renders only a
  // subset of workspaces (a Space), `includeStray: false` keeps the other
  // spaces' sessions out of the ungrouped bucket; the Default space shows them.
  const stray =
    view.includeStray === false
      ? []
      : (list.ids ?? [])
          .map((id) => list.byId?.[id])
          .filter((summary) => summary !== undefined && !accounted.has(summary.id) && visible(summary, list.current, archived, settled))

  if (stray.length > 0) {
    groups.push(
      buildGroup({
        key: UNGROUPED_KEY,
        workspaceId: undefined,
        cwd: undefined,
        label: '',
        members: stray,
        sort: true,
        descendants,
        pendingInteractions,
        expanded: expanded.has(UNGROUPED_KEY),
        showAll: shownAll.has(UNGROUPED_KEY),
        perGroup,
        containsCurrent: currentGroup === UNGROUPED_KEY,
      }),
    )
  }

  return groups
}

function buildGroup(input) {
  const members = input.sort ? [...input.members].sort(byRecency) : [...input.members]
  const nodes = members.map((summary) => sessionNode(summary, input.descendants, input.pendingInteractions))
  const capped = input.showAll ? nodes : nodes.slice(0, input.perGroup)
  return {
    key: input.key,
    workspaceId: input.workspaceId,
    cwd: input.cwd,
    label: input.label,
    sessionCount: nodes.length,
    expanded: input.expanded,
    containsCurrent: input.containsCurrent,
    // Rows actually rendered — the numbering source of truth.
    sessions: input.expanded ? capped : [],
    hiddenCount: input.expanded ? Math.max(0, nodes.length - capped.length) : 0,
    showingAll: input.showAll,
  }
}

/**
 * Assign Ctrl+Shift shortcut numbers 1..max across every visible row, running
 * continuously from one workspace into the next in display order. This is what
 * makes "five rows in the first workspace, four in the second" number 1-5 and
 * 6-9 rather than restarting per group.
 *
 * @param groups - derived groups in render order.
 * @param max - highest assignable number (9: there is no Ctrl+Shift+10).
 * @returns Map of session id to its 1-based shortcut number.
 */
export function assignShortcuts(groups, max = 9) {
  const assigned = new Map()
  let next = 1
  for (const group of groups) {
    for (const session of group.sessions) {
      if (next > max) return assigned
      assigned.set(session.id, next)
      next += 1
    }
  }
  return assigned
}

/**
 * Merge local title/workspace matches with ranked host content matches,
 * excluding archived and settled sessions from both halves.
 *
 * @returns `{ items, hasMore }` where `hasMore` asks the user to narrow.
 */
export function deriveSearchResults(input) {
  const { list, workspaces, query, archivedSessionIds, settledSessionIds, pendingInteractions, content, limit } = input
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return { items: [], hasMore: false }

  const archived = new Set(archivedSessionIds ?? [])
  const settled = new Set(settledSessionIds ?? [])
  const descendants = indexSubagentDescendants(list.byId ?? {})

  const workspaceById = new Map()
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) workspaceById.set(id, workspace.title || workspaceLabel(workspace.path))
  }

  const eligible = (summary) =>
    summary !== undefined &&
    summary.origin !== 'subagent' &&
    // A blank row has no durable title, so it can never match a query.
    !summary.blank &&
    !archived.has(summary.id) &&
    !settled.has(summary.id)

  const matches = (summary) => {
    const workspace = workspaceById.get(summary.id) ?? ''
    return (
      (summary.displayTitle ?? '').toLowerCase().includes(normalized) ||
      (summary.cwd ?? '').toLowerCase().includes(normalized) ||
      workspace.toLowerCase().includes(normalized)
    )
  }

  const toRow = (summary, snippet) => {
    const node = sessionNode(summary, descendants, pendingInteractions)
    return {
      id: summary.id,
      title: summary.displayTitle,
      workspace: workspaceById.get(summary.id) ?? workspaceLabel(summary.cwd),
      running: node.running,
      runningSubagentCount: node.runningSubagentCount,
      completed: node.completed,
      hasActiveSchedule: node.hasActiveSchedule,
      pendingInteraction: node.pendingInteraction,
      ...(snippet === undefined ? {} : { snippet }),
    }
  }

  const rows = []
  const seen = new Set()

  for (const summary of (list.ids ?? []).map((id) => list.byId?.[id]).filter(eligible).sort(byRecency)) {
    if (!matches(summary)) continue
    seen.add(summary.id)
    rows.push(toRow(summary))
  }

  for (const item of content?.items ?? []) {
    const summary = list.byId?.[item.sessionId]
    if (!eligible(summary)) continue
    if (seen.has(summary.id)) {
      // Local row already present: enrich it in place with the host excerpt.
      const existing = rows.find((row) => row.id === summary.id)
      if (existing !== undefined && existing.snippet === undefined && item.snippet !== undefined) {
        existing.snippet = item.snippet
      }
      continue
    }
    seen.add(summary.id)
    rows.push(toRow(summary, item.snippet))
  }

  const bounded = rows.slice(0, limit)
  return { items: bounded, hasMore: (content?.hasMore ?? false) || rows.length > bounded.length }
}

/**
 * Settled rows for the drawer, in settle order (most recent first). Ids whose
 * session no longer exists are skipped rather than rendered as ghosts.
 */
export function deriveSettled(list, settledSessionIds, workspaces) {
  const workspaceById = new Map()
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) workspaceById.set(id, workspace.title || workspaceLabel(workspace.path))
  }
  const rows = []
  for (const id of settledSessionIds ?? []) {
    const summary = list.byId?.[id]
    if (summary === undefined) continue
    rows.push({
      id,
      title: summary.displayTitle || id,
      workspace: workspaceById.get(id) ?? workspaceLabel(summary.cwd),
      updatedAt: summary.updatedAt ?? 0,
      running: summary.running === true,
    })
  }
  return rows
}
