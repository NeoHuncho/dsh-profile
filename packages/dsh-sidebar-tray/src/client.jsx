/**
 * dsh-sidebar-tray — browser half.
 *
 * Registers a replacement browsing region into the sidebar's `sidebar.workspaces`
 * slot.
 *
 * Why a replacement rather than an overlay: that slot is a `single` slot owned
 * by the shipped ui-workspace plugin, its rows carry no session id in the DOM,
 * and it ships minified without sourcemaps — so "settle" (removing a row from
 * the list) cannot be layered on from outside it. The slot system's documented
 * mechanism for this is priority shadowing ("register at a different priority
 * to shadow it — lowest renders"), so this entry registers at priority -1. The
 * shipped plugin is left completely untouched: drop this plugin's row from the
 * profile patch and the original region returns on the next start.
 *
 * The replacement must not re-declare the shipped
 * `sidebar.workspaces.directoryFlow` child hole: child-slot declarations are
 * exclusive even when their parent entries use priority shadowing. "Add
 * workspace…" therefore calls the existing uiWorkspace directory-picker
 * service directly.
 */

import { createSettledStore } from './settled-store.js'
import { deriveGroups, deriveSearchResults, deriveSettled, workspaceLabel } from './derive.js'
import { useShortcutActivation } from './shortcuts.js'
import { DEFAULT_SPACE_ID, SPACE_EMOJI_PRESETS, deriveSpaces, spaceOfWorkspace } from './spaces.js'
import TRAY_CSS from './tray.css?raw'

const SEARCH_DEBOUNCE_MS = 200

/** Stable empty map: a fresh one each render would defeat every useMemo below. */
const EMPTY_PENDING = new Map()

/** Compact relative time, matching the shipped sidebar's vocabulary. */
function timeLabel(value, now) {
  if (!Number.isFinite(value) || value <= 0) return ''
  const seconds = Math.max(0, Math.round((now - value) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.round(months / 12)}y`
}

/** The status dot: pending interaction outranks activity, which outranks done. */
function statusClass(node) {
  if (node.pendingInteraction !== undefined) return 'tray-dot-attention'
  if (node.running || node.runningSubagentCount > 0) return 'tray-dot-running'
  if (node.completed) return 'tray-dot-done'
  return null
}

function StatusDot({ React, node }) {
  const tone = statusClass(node)
  return React.createElement(
    'span',
    { className: 'tray-slot' },
    tone === null ? null : React.createElement('span', { className: `tray-dot ${tone}` }),
  )
}

/**
 * Hold Ctrl (or Cmd) → true. Used to reveal the ⇧n shortcut hints over the
 * space emojis, Arc-style. Resets on blur so a chord released outside the
 * window never leaves the hints stuck on.
 */
function useChordHeld(React) {
  const [held, setHeld] = React.useState(false)
  React.useEffect(() => {
    const down = (event) => { if (event.ctrlKey || event.metaKey) setHeld(true) }
    const up = (event) => { if (!(event.ctrlKey || event.metaKey)) setHeld(false) }
    const reset = () => setHeld(false)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', reset)
    }
  }, [])
  return held
}

/** Active space heading at the top of the list: emoji + name. */
function SpaceHeader({ React, space, rail }) {
  return React.createElement(
    'div',
    { className: `tray-space-header${rail ? ' tray-space-header-rail' : ''}`, title: space.name },
    React.createElement('span', { className: 'tray-space-header-emoji', 'aria-hidden': 'true' }, space.emoji),
    rail ? null : React.createElement('span', { className: 'tray-space-header-name' }, space.name),
    rail || space.workspaces.length === 0
      ? null
      : React.createElement('span', { className: 'tray-space-header-count' }, String(space.workspaces.length)),
  )
}

/**
 * The space dock (Arc-style): centred emojis at the foot of the tray, just
 * above Settings. Click selects; right-click opens rename / emoji / move /
 * delete. While Ctrl/Cmd is held each emoji shows its ⇧n hint.
 */
function SpaceDock({ React, spaces, activeSpaceId, onSelect, onCreate, onRename, onEmoji, onDelete, onMove, rail }) {
  const [menuFor, setMenuFor] = React.useState(null)
  const [emojiFor, setEmojiFor] = React.useState(null)
  const held = useChordHeld(React)

  React.useEffect(() => {
    if (menuFor === null && emojiFor === null) return undefined
    const close = () => { setMenuFor(null); setEmojiFor(null) }
    const onKey = (event) => { if (event.key === 'Escape') close() }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menuFor, emojiFor])

  const items = spaces.map((space, index) => {
    const active = space.id === activeSpaceId
    const number = index + 1
    return React.createElement(
      'button',
      {
        type: 'button',
        key: space.id,
        className: `tray-space${active ? ' tray-space-active' : ''}`,
        title: number <= 9 ? `${space.name} — Ctrl+Shift+${number}` : space.name,
        'aria-label': space.name,
        'aria-pressed': active,
        onClick: () => onSelect(space.id),
        onContextMenu: (event) => {
          event.preventDefault()
          setEmojiFor(null)
          setMenuFor(space.id)
        },
      },
      React.createElement('span', { className: 'tray-space-emoji', 'aria-hidden': 'true' }, space.emoji),
      held && number <= 9
        ? React.createElement('kbd', { className: 'tray-space-hint', 'aria-hidden': 'true' }, `\u21E7${number}`)
        : null,
    )
  })

  const menuSpace = menuFor === null ? undefined : spaces.find((s) => s.id === menuFor)
  const emojiSpace = emojiFor === null ? undefined : spaces.find((s) => s.id === emojiFor)
  const item = (label, onClick, extra = {}) =>
    React.createElement('button', { type: 'button', role: 'menuitem', onClick, ...extra }, label)

  const menu =
    menuSpace === undefined
      ? null
      : React.createElement(
          'div',
          { className: 'tray-space-menu', role: 'menu', onPointerDown: (event) => event.stopPropagation() },
          React.createElement('div', { className: 'tray-space-menu-title' }, `${menuSpace.emoji} ${menuSpace.name}`),
          item('Rename…', () => { setMenuFor(null); onRename(menuSpace.id, menuSpace.name) }),
          item('Change emoji…', () => { setMenuFor(null); setEmojiFor(menuSpace.id) }),
          menuSpace.builtin ? null : item('Move left', () => { setMenuFor(null); onMove(menuSpace.id, -1) }),
          menuSpace.builtin ? null : item('Move right', () => { setMenuFor(null); onMove(menuSpace.id, 1) }),
          menuSpace.builtin
            ? null
            : item('Delete space', () => {
                setMenuFor(null)
                if (window.confirm(`Delete space \u201C${menuSpace.name}\u201D? Its workspaces move back to ${spaces[0].name}.`)) onDelete(menuSpace.id)
              }, { className: 'tray-space-menu-danger' }),
        )

  const emojiMenu =
    emojiSpace === undefined
      ? null
      : React.createElement(
          'div',
          { className: 'tray-space-menu tray-space-emoji-menu', role: 'menu', onPointerDown: (event) => event.stopPropagation() },
          React.createElement('div', { className: 'tray-space-menu-title' }, `Emoji for ${emojiSpace.name}`),
          React.createElement(
            'div',
            { className: 'tray-space-emoji-grid' },
            ...SPACE_EMOJI_PRESETS.map((emoji) =>
              React.createElement(
                'button',
                {
                  type: 'button',
                  key: emoji,
                  className: `tray-space-emoji-option${emoji === emojiSpace.emoji ? ' tray-space-emoji-current' : ''}`,
                  title: emoji,
                  onClick: () => { setEmojiFor(null); onEmoji(emojiSpace.id, emoji) },
                },
                emoji,
              ),
            ),
          ),
          item('Other…', () => {
            setEmojiFor(null)
            const typed = window.prompt('Paste or type an emoji', emojiSpace.emoji)
            if (typed !== null && typed.trim() !== '') onEmoji(emojiSpace.id, typed)
          }),
        )

  return React.createElement(
    'div',
    { className: `tray-space-dock${rail ? ' tray-space-dock-rail' : ''}`, role: 'tablist', 'aria-label': 'Spaces' },
    ...items,
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'tray-space tray-space-add',
        title: 'New space',
        'aria-label': 'New space',
        onClick: () => {
          const name = window.prompt('Name the new space')
          if (name === null || name.trim() === '') return
          const emoji = window.prompt('Emoji for this space (optional)', '')
          onCreate(name, emoji ?? '')
        },
      },
      '\uFF0B',
    ),
    menu,
    emojiMenu,
  )
}

/** One session row. */
function SessionRow({ React, node, selected, now, onOpen, onSettle, onRename, onFork, onArchive }) {
  const stop = (event, run) => {
    event.stopPropagation()
    event.preventDefault()
    run()
  }

  const title = node.blank || node.title === '' ? 'New session' : node.title

  return React.createElement(
    'div',
    {
      className: `tray-session-row${selected ? ' tray-selected' : ''}`,
      role: 'treeitem',
      'aria-selected': selected,
      'data-session-id': node.id,
      title,
      onClick: () => onOpen(node.id),
    },
    React.createElement(StatusDot, { React, node }),
    React.createElement('span', { className: 'tray-session-title' }, title),
    React.createElement('span', { className: 'tray-session-time' }, timeLabel(node.updatedAt, now)),
    node.blank
      ? null
      : React.createElement(
          'span',
          { className: 'tray-row-actions' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'tray-row-button',
              title: 'Settle conversation',
              'aria-label': `Settle ${title}`,
              onClick: (event) => stop(event, () => onSettle(node.id)),
            },
            '\u25BE',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'tray-row-button',
              title: 'Rename',
              'aria-label': `Rename ${title}`,
              onClick: (event) => stop(event, () => onRename(node.id, node.title)),
            },
            '\u270E',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'tray-row-button',
              title: 'Fork session',
              'aria-label': `Fork ${title}`,
              onClick: (event) => stop(event, () => onFork(node.id)),
            },
            '\u2387',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'tray-row-button',
              title: 'Archive session',
              'aria-label': `Archive ${title}`,
              onClick: (event) => stop(event, () => onArchive(node.id)),
            },
            '\u2715',
          ),
        ),
  )
}

/** The whole browsing region. */
function SidebarTray(props) {
  const {
    React,
    wide,
    useSessions,
    useWorkspaces,
    useSessionPendingInteraction,
    settledStore,
    // Named `tray` rather than `actions`: the slot framework already supplies
    // an `actions` prop for a registered store's bound actions, and shadowing
    // it here would be a silent collision the day this entry gains a store.
    tray,
  } = props

  const list = useSessions((state) => state)
  const workspaceSnapshot = useWorkspaces((state) => state) || {}
  const allWorkspaces = workspaceSnapshot.items ?? []
  const archivedSessionIds = workspaceSnapshot.archivedSessionIds ?? []

  const settled = React.useSyncExternalStore(settledStore.subscribe, settledStore.getSnapshot)

  // Environment child workspaces (per-conversation worktrees owned by
  // dsh-workspace-console) follow their parent's Space. The console publishes
  // `window.__dshEnvParents__` = { childWorkspaceId: parentWorkspaceId } and
  // fires `dsh-env-registry` whenever it changes.
  const [envParents, setEnvParents] = React.useState(() => window.__dshEnvParents__ ?? {})
  React.useEffect(() => {
    const sync = () => setEnvParents(window.__dshEnvParents__ ?? {})
    window.addEventListener('dsh-env-registry', sync)
    sync()
    return () => window.removeEventListener('dsh-env-registry', sync)
  }, [])

  // Spaces: Default + user spaces, each with the workspaces it shows.
  const spaces = React.useMemo(
    () => deriveSpaces(settled.spaces, allWorkspaces, { parentOf: (workspace) => envParents[workspace.workspaceId], defaultSpace: settled.defaultSpace }),
    [settled.spaces, settled.defaultSpace, allWorkspaces, envParents],
  )
  const activeSpace = spaces.find((space) => space.id === settled.activeSpaceId) ?? spaces[0]
  // Only the active space's workspaces feed the groups below; ungrouped
  // (stray) sessions are shown in Default only, so they are never lost.
  const workspaces = activeSpace.workspaces
  const showStray = activeSpace.id === DEFAULT_SPACE_ID

  const [expandedGroups, setExpandedGroups] = React.useState(null)
  const [shownGroups, setShownGroups] = React.useState([])
  const [settledOpen, setSettledOpen] = React.useState(false)
  const [settledShowAll, setSettledShowAll] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [content, setContent] = React.useState({ items: [], hasMore: false })
  const [searchState, setSearchState] = React.useState('idle')
  const [now, setNow] = React.useState(() => Date.now())
  // "Add workspace…" flow: the occupant of the directoryFlow hole runs the
  // actual picking and reports exactly one outcome per open.
  const [flowBusy, setFlowBusy] = React.useState(false)
  const [flowError, setFlowError] = React.useState(null)

  // Relative times must age without a data change driving a render.
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  // A selector hook, like the other standard seats: it takes a selector and is
  // called unconditionally, since a conditional call would make this component's
  // hook order depend on prop presence.
  const pendingInteractions = useSessionPendingInteraction((state) => state) ?? EMPTY_PENDING

  // Every workspace starts expanded, matching the shipped first-run posture;
  // after the first user toggle the explicit set is authoritative.
  const effectiveExpanded = React.useMemo(
    () => (expandedGroups === null ? [...workspaces.map((w) => w.workspaceId), ''] : expandedGroups),
    [expandedGroups, workspaces],
  )

  const groups = React.useMemo(
    () =>
      deriveGroups(
        list,
        workspaces,
        archivedSessionIds,
        settled.settledSessionIds,
        pendingInteractions,
        {
          expandedGroups: effectiveExpanded,
          shownGroups,
          perGroup: settled.sessionsPerWorkspace,
          includeStray: showStray,
        },
      ),
    [list, workspaces, archivedSessionIds, settled, pendingInteractions, effectiveExpanded, shownGroups, showStray],
  )

  // Ctrl+Shift+<n> switches to the n-th space (Default is 1).
  useShortcutActivation(React, settled.shortcutsEnabled, (index) => {
    const target = spaces[index - 1]
    if (target !== undefined) settledStore.setActiveSpace(target.id)
  })

  const spaceHeader = React.createElement(SpaceHeader, { React, space: activeSpace, rail: wide === false })
  const spaceBar = React.createElement(SpaceDock, {
    React,
    spaces,
    activeSpaceId: activeSpace.id,
    rail: wide === false,
    onSelect: (id) => settledStore.setActiveSpace(id),
    onCreate: (name, emoji) => settledStore.createSpace(name, emoji),
    onEmoji: (id, emoji) => settledStore.setSpaceEmoji(id, emoji),
    onRename: (id, current) => {
      const next = window.prompt('Rename space', current)
      if (next !== null && next.trim() !== '' && next.trim() !== current) settledStore.renameSpace(id, next)
    },
    onDelete: (id) => settledStore.deleteSpace(id),
    onMove: (id, direction) => settledStore.moveSpace(id, direction),
  })

  const moveWorkspaceToSpace = (workspaceId) => {
    const current = spaceOfWorkspace(settled.spaces, workspaceId)
    const options = spaces.map((space, index) => `${index + 1}. ${space.emoji} ${space.name}${space.id === current ? ' (current)' : ''}`)
    const answer = window.prompt(`Move workspace to which space?\n\n${options.join('\n')}\n\nEnter a number:`)
    if (answer === null) return
    const target = spaces[Number(answer.trim()) - 1]
    if (target === undefined || target.id === current) return
    settledStore.assignWorkspace(workspaceId, target.id)
  }

  // Host content search, debounced; a superseded query aborts in flight.
  React.useEffect(() => {
    const normalized = query.trim()
    setContent({ items: [], hasMore: false })
    if (normalized === '') {
      setSearchState('idle')
      return undefined
    }
    setSearchState('loading')
    const controller = new AbortController()
    const timer = setTimeout(() => {
      Promise.resolve(tray.searchSessions(normalized, controller.signal))
        .then((result) => {
          if (controller.signal.aborted) return
          setContent({ items: result?.items ?? [], hasMore: result?.hasMore ?? false })
          setSearchState('ready')
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchState('error')
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const searching = query.trim() !== ''

  const results = React.useMemo(
    () =>
      searching
        ? deriveSearchResults({
            list,
            workspaces,
            query,
            archivedSessionIds,
            settledSessionIds: settled.settledSessionIds,
            pendingInteractions,
            content,
            limit: tray.searchResultLimit ?? 40,
          })
        : { items: [], hasMore: false },
    [searching, list, workspaces, query, archivedSessionIds, settled, pendingInteractions, content],
  )

  const settledRows = React.useMemo(
    () => deriveSettled(list, settled.settledSessionIds, workspaces),
    [list, settled, workspaces],
  )

  const toggleGroup = (key) => {
    const open = effectiveExpanded.includes(key)
    setExpandedGroups(open ? effectiveExpanded.filter((entry) => entry !== key) : [...effectiveExpanded, key])
  }

  const toggleShowAll = (key) =>
    setShownGroups((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]))

  // The rail (collapsed sidebar) shows only the affordance that re-expands it.
  if (wide === false) {
    return React.createElement(
      'div',
      { className: 'tray-root tray-rail' },
      React.createElement(
        'div',
        { className: 'tray-header' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'tray-icon-button',
            title: 'New session',
            'aria-label': 'New session',
            onClick: () => tray.startSession(),
          },
          '\uFF0B',
        ),
      ),
      spaceHeader,
      spaceBar,
    )
  }

  const body = []

  if (searching) {
    if (results.items.length === 0) {
      body.push(
        React.createElement(
          'div',
          { className: 'tray-status', key: 'search-empty' },
          searchState === 'loading'
            ? 'Searching…'
            : searchState === 'error'
              ? 'Search is unavailable.'
              : 'No conversations match.',
        ),
      )
    } else {
      for (const result of results.items) {
        body.push(
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'tray-result-row',
              key: `result-${result.id}`,
              onClick: () => tray.open(result.id),
            },
            React.createElement('span', { className: 'tray-result-title' }, result.title),
            React.createElement('span', { className: 'tray-result-meta' }, result.workspace || 'Ungrouped'),
            result.snippet === undefined
              ? null
              : React.createElement('span', { className: 'tray-result-snippet' }, result.snippet),
          ),
        )
      }
      if (results.hasMore) {
        body.push(
          React.createElement(
            'div',
            { className: 'tray-status', key: 'search-more' },
            'More matches — narrow the search.',
          ),
        )
      }
    }
  } else {
    // Environment child workspaces render nested under their parent project.
    const childrenOf = new Map()
    const topLevel = []
    for (const group of groups) {
      const parent = group.workspaceId === undefined ? undefined : envParents[group.workspaceId]
      if (parent !== undefined && groups.some((g) => g.workspaceId === parent)) {
        if (!childrenOf.has(parent)) childrenOf.set(parent, [])
        childrenOf.get(parent).push(group)
      } else topLevel.push(group)
    }
    const renderGroup = (group, nested) => {
      const label = group.label || workspaceLabel(group.cwd) || 'Ungrouped'
      const env = nested && group.workspaceId !== undefined ? window.__dshEnv__?.envForWorkspace(group.workspaceId) : undefined
      return (
        React.createElement(
          'div',
          { className: `tray-group${nested ? ' tray-group-nested' : ''}`, key: `group-${group.key || 'ungrouped'}` },
          React.createElement(
            'div',
            {
              className: 'tray-project-row',
              onClick: () => toggleGroup(group.key),
              title: group.cwd ?? label,
            },
            React.createElement(
              'span',
              { className: `tray-arrow${group.expanded ? ' tray-arrow-open' : ''}`, 'aria-hidden': 'true' },
              '\u25B6',
            ),
            env !== undefined
              ? React.createElement('span', { className: `tray-env-dot tray-env-dot-${env.state}`, 'aria-hidden': 'true', title: env.state })
              : null,
            React.createElement('span', { className: 'tray-project-label' }, nested ? label.replace(/^.*\u00B7\s*/, '') : label),
            React.createElement('span', { className: 'tray-project-count' }, String(group.sessionCount)),
            group.workspaceId === undefined
              ? null
              : React.createElement(
                  'span',
                  { className: 'tray-row-actions' },
                  spaces.length > 1 && !nested
                    ? React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: 'tray-row-button',
                          title: `Move ${label} to another space`,
                          'aria-label': `Move ${label} to another space`,
                          onClick: (event) => {
                            event.stopPropagation()
                            moveWorkspaceToSpace(group.workspaceId)
                          },
                        },
                        '\u2937',
                      )
                    : null,
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'tray-row-button',
                      title: `New session in ${label}`,
                      'aria-label': `New session in ${label}`,
                      onClick: (event) => {
                        event.stopPropagation()
                        tray.startSession(group.workspaceId)
                      },
                    },
                    '\uFF0B',
                  ),
                ),
          ),
          ...group.sessions.map((node) =>
            React.createElement(SessionRow, {
              React,
              key: node.id,
              node,
              selected: node.id === list.current,
              now,
              onOpen: tray.open,
              onSettle: (id) => tray.settle(id, list.byId?.[id]?.cwd),
              onRename: tray.renameSession,
              onFork: tray.forkSession,
              onArchive: tray.archiveSession,
            }),
          ),
          group.hiddenCount > 0
            ? React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'tray-more',
                  key: 'more',
                  onClick: () => toggleShowAll(group.key),
                },
                `Show ${group.hiddenCount} more`,
              )
            : null,
          group.showingAll && group.expanded && group.sessionCount > settled.sessionsPerWorkspace
            ? React.createElement(
                'button',
                { type: 'button', className: 'tray-more', key: 'less', onClick: () => toggleShowAll(group.key) },
                'Show less',
              )
            : null,
        )
      )
    }
    for (const group of topLevel) {
      body.push(renderGroup(group, false))
      for (const child of childrenOf.get(group.workspaceId) ?? []) body.push(renderGroup(child, true))
    }

    if (groups.length === 0) {
      body.push(
        React.createElement(
          'div',
          { className: 'tray-status', key: 'empty' },
          activeSpace.builtin ? 'No conversations yet.' : 'This space is empty. Add a workspace with ⊞ or move one here.',
        ),
      )
    }
  }

  const settledPreview = settledShowAll ? settledRows : settledRows.slice(0, settled.settledPreviewCount)
  const settledHidden = settledRows.length - settledPreview.length

  return React.createElement(
    'div',
    { className: 'tray-root' },
    React.createElement(
      'div',
      { className: 'tray-header' },
      React.createElement('span', { className: 'tray-header-label' }, 'Conversations'),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'tray-icon-button',
          title: 'Add workspace…',
          'aria-label': 'Add workspace',
          disabled: flowBusy,
          onClick: async () => {
            setFlowError(null)
            setFlowBusy(true)
            try {
              const path = await tray.pickDirectory()
              if (path !== undefined && path !== null) {
                const created = await tray.createWorkspace({ path })
                // A workspace added while a user space is active belongs to it.
                if (!activeSpace.builtin && created?.workspaceId !== undefined) {
                  settledStore.assignWorkspace(created.workspaceId, activeSpace.id)
                }
              }
            } catch (error) {
              setFlowError(String(error?.message ?? error))
            } finally {
              setFlowBusy(false)
            }
          },
        },
        '\u229E',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'tray-icon-button',
          title: 'New session',
          'aria-label': 'New session',
          onClick: () => tray.startSession(),
        },
        '\uFF0B',
      ),
    ),
    spaceHeader,
    flowError === null
      ? null
      : React.createElement('div', { className: 'tray-status' }, `Couldn’t add workspace: ${flowError}`),
    React.createElement(
      'div',
      { className: 'tray-search' },
      React.createElement('span', { 'aria-hidden': 'true' }, '\u2315'),
      React.createElement('input', {
        className: 'tray-search-input',
        type: 'search',
        value: query,
        placeholder: 'Search conversations',
        'aria-label': 'Search conversations',
        onChange: (event) => setQuery(event.target.value),
      }),
    ),
    React.createElement('div', { className: 'tray-body', role: 'tree', 'aria-label': 'Conversations' }, body),
    settledRows.length === 0
      ? null
      : React.createElement(
          'div',
          { className: 'tray-settled' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'tray-settled-header',
              'aria-expanded': settledOpen,
              onClick: () => setSettledOpen((open) => !open),
            },
            React.createElement(
              'span',
              { className: `tray-arrow${settledOpen ? ' tray-arrow-open' : ''}`, 'aria-hidden': 'true' },
              '\u25B6',
            ),
            React.createElement('span', { className: 'tray-settled-label' }, 'Settled'),
            React.createElement('span', { className: 'tray-settled-count' }, String(settledRows.length)),
          ),
          settledOpen
            ? React.createElement(
                'div',
                { className: 'tray-settled-list' },
                ...settledPreview.map((row) =>
                  React.createElement(
                    'div',
                    {
                      className: 'tray-session-row tray-settled-row',
                      key: `settled-${row.id}`,
                      title: row.title,
                      onClick: () => tray.open(row.id),
                    },
                    React.createElement('span', { className: 'tray-slot' }),
                    React.createElement('span', { className: 'tray-session-title' }, row.title),
                    React.createElement('span', { className: 'tray-session-time' }, timeLabel(row.updatedAt, now)),
                    React.createElement(
                      'span',
                      { className: 'tray-row-actions' },
                      React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: 'tray-row-button',
                          title: 'Unsettle conversation',
                          'aria-label': `Unsettle ${row.title}`,
                          onClick: (event) => {
                            event.stopPropagation()
                            tray.unsettle(row.id, list.byId?.[row.id]?.cwd)
                          },
                        },
                        '\u21A9',
                      ),
                    ),
                  ),
                ),
                settledHidden > 0
                  ? React.createElement(
                      'button',
                      { type: 'button', className: 'tray-more', onClick: () => setSettledShowAll(true) },
                      `Show ${settledHidden} more`,
                    )
                  : null,
                settledShowAll && settledRows.length > settled.settledPreviewCount
                  ? React.createElement(
                      'button',
                      { type: 'button', className: 'tray-more', onClick: () => setSettledShowAll(false) },
                      'Show less',
                    )
                  : null,
              )
            : null,
        ),
    spaceBar,
  )
}

/** Hard dependencies: without any of these the region cannot render at all. */
export const inject = ['slots', 'sessions', 'workspaces', 'uiWorkspace', 'remote']

export function apply(ctx) {
  const React = require('react')
  const sessions = ctx.get('sessions')
  const workspaces = ctx.get('workspaces')
  const uiWorkspace = ctx.get('uiWorkspace')
  const slots = ctx.get('slots')

  if (sessions === undefined || workspaces === undefined || uiWorkspace === undefined || slots === undefined) {
    console.error('[dsh-sidebar-tray] required client services are unavailable; leaving the shipped sidebar in place')
    return
  }

  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-sidebar-tray'
  style.textContent = TRAY_CSS
  document.head.append(style)
  ctx.effect(() => () => style.remove(), 'sidebar-tray: styles')

  const settledStore = createSettledStore(ctx.get('remote'))
  void settledStore.reload()

  // The settings document is the authority; re-read it whenever the host
  // commits a change so a second browser (or a hand edit) converges here.
  ctx.effect(
    () =>
      ctx.on('settings/updated', () => {
        void settledStore.reload()
      }),
    'sidebar-tray: settings sync',
  )

  // Worktree environments are owned by dsh-workspace-console, which exposes a
  // small bridge on `window.__dshEnv__` (no shared client service exists
  // between two profile packages). Everything below degrades to plain
  // behaviour when that package is not mounted.
  const envBridge = () => window.__dshEnv__

  const tray = {
    open: (sessionId) => uiWorkspace.openSession(sessionId),
    /**
     * New conversation. Nothing environment-related happens here: on an
     * env-enabled project the worktree is created by dsh-workspace-console
     * when the first prompt is sent (see its "Start on a new worktree" toggle).
     */
    startSession: (workspaceId) => uiWorkspace.startSession(workspaceId),
    forkSession: (sessionId) => {
      Promise.resolve(uiWorkspace.forkSession(sessionId)).catch(() => {})
    },
    archiveSession: (sessionId) => {
      Promise.resolve(uiWorkspace.archiveSession(sessionId)).catch(() => {})
    },
    renameSession: (sessionId, currentTitle) => {
      const next = window.prompt('Rename conversation', currentTitle ?? '')
      if (next === null) return
      const trimmed = next.trim()
      if (trimmed === '' || trimmed === currentTitle) return
      const session = sessions.binding(sessionId)?.session
      Promise.resolve(session?.rename(trimmed)).catch(() => {})
    },
    /**
     * Settling a conversation that lives in a worktree environment stops and
     * deletes that environment. Uncommitted changes (or commits not yet in the
     * main checkout) trigger a confirmation first; on OK they are committed to
     * the env branch, which is kept. Unsettling restores the worktree.
     */
    settle: async (sessionId, cwd) => {
      const bridge = envBridge()
      const env = cwd && bridge ? bridge.envForCwd(cwd) : undefined
      if (env !== undefined) {
        let info
        try {
          info = await bridge.dirty(env.id)
        } catch (error) {
          console.error('[dsh-sidebar-tray] could not inspect environment', error)
        }
        if (info?.dirty || info?.ahead > 0) {
          const parts = []
          if (info.dirty) parts.push(`uncommitted changes:\n${info.summary}`)
          if (info.ahead > 0) parts.push(`${info.ahead} commit${info.ahead === 1 ? '' : 's'} not in the main checkout`)
          const ok = window.confirm(
            `Worktree \u201C${env.slug}\u201D (branch ${env.branch}) has ${parts.join('\n\nand ')}\n\n` +
              'Settling stops the environment, commits the changes as WIP on that branch and removes the worktree. Continue?',
          )
          if (!ok) return
        }
      }
      settledStore.settle(sessionId)
      if (env !== undefined) {
        Promise.resolve(bridge.act(env.id, 'teardown')).catch((error) => {
          console.error('[dsh-sidebar-tray] environment teardown failed', error)
          window.alert(`Conversation settled, but its environment could not be torn down:\n${error?.message ?? error}`)
        })
      }
    },
    unsettle: (sessionId, cwd) => {
      settledStore.unsettle(sessionId)
      const bridge = envBridge()
      const env = cwd && bridge ? bridge.tornDownFor(cwd) : undefined
      if (env !== undefined) {
        Promise.resolve(bridge.act(env.id, 'restore')).catch((error) => {
          console.error('[dsh-sidebar-tray] environment restore failed', error)
          window.alert(`Conversation restored, but its environment could not be recreated:\n${error?.message ?? error}`)
        })
      }
    },
    searchSessions: async (query, signal) => {
      const result = await sessions.search(query, signal)
      if (result?.ok !== true) throw new Error(result?.error?.message ?? 'search failed')
      return result.value
    },
    searchResultLimit: sessions.searchResultLimit ?? 40,
    pickDirectory: () => uiWorkspace.pickDirectory(),
    createWorkspace: (input) => workspaces.create(input),
  }

  slots.inject('sidebar.workspaces', () =>
    slots.register(
      {
        name: 'sidebar.workspaces',
        // Shadow the shipped region: lowest priority renders.
        priority: -1,
        registrant: 'dsh-sidebar-tray',
      },
      (props) => React.createElement(SidebarTray, { ...props, React, settledStore, tray }),
    ),
  )
}
