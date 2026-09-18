/**
 * Derivation tests.
 *
 * These cover the logic the UI cannot be trusted to reveal by inspection: the
 * per-workspace cap, continuous shortcut numbering ACROSS workspaces, and the
 * rule that settled conversations leave both the list and the search results.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { assignShortcuts, deriveGroups, deriveSearchResults, deriveSettled } from '../src/derive.js'

/** Build a session list snapshot from compact tuples. */
function makeList(entries, current) {
  const byId = {}
  const ids = []
  for (const entry of entries) {
    byId[entry.id] = {
      id: entry.id,
      displayTitle: entry.title ?? entry.id,
      blank: entry.blank ?? false,
      running: entry.running ?? false,
      updatedAt: entry.updatedAt ?? 1000,
      cwd: entry.cwd,
      origin: entry.origin,
      parentId: entry.parentId,
    }
    ids.push(entry.id)
  }
  return { ids, byId, current }
}

const workspace = (id, sessionIds, title) => ({
  workspaceId: id,
  path: `/tmp/${id}`,
  title: title ?? id,
  sessionIds,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const view = (keys, perGroup = 5) => ({ expandedGroups: keys, shownGroups: [], perGroup })

test('each workspace shows at most five sessions and reports the remainder', () => {
  const list = makeList([...Array(8)].map((_, i) => ({ id: `s${i}` })))
  const groups = deriveGroups(list, [workspace('w1', list.ids)], [], [], new Map(), view(['w1']))

  assert.equal(groups[0].sessions.length, 5)
  assert.equal(groups[0].sessionCount, 8)
  assert.equal(groups[0].hiddenCount, 3)
})

test('"show more" reveals the whole group', () => {
  const list = makeList([...Array(8)].map((_, i) => ({ id: `s${i}` })))
  const groups = deriveGroups(list, [workspace('w1', list.ids)], [], [], new Map(), {
    expandedGroups: ['w1'],
    shownGroups: ['w1'],
    perGroup: 5,
  })

  assert.equal(groups[0].sessions.length, 8)
  assert.equal(groups[0].hiddenCount, 0)
})

test('shortcuts run continuously across workspaces: 5 in the first, 4 in the second', () => {
  // The exact scenario in the request: five visible in workspace A, the second
  // workspace expanded, nine visible rows overall.
  const list = makeList([
    ...[...Array(5)].map((_, i) => ({ id: `a${i}` })),
    ...[...Array(4)].map((_, i) => ({ id: `b${i}` })),
  ])
  const groups = deriveGroups(
    list,
    [workspace('wa', ['a0', 'a1', 'a2', 'a3', 'a4']), workspace('wb', ['b0', 'b1', 'b2', 'b3'])],
    [],
    [],
    new Map(),
    view(['wa', 'wb']),
  )

  const shortcuts = assignShortcuts(groups, 9)
  assert.equal(shortcuts.get('a0'), 1)
  assert.equal(shortcuts.get('a4'), 5)
  // Continues into the next workspace rather than restarting at 1.
  assert.equal(shortcuts.get('b0'), 6)
  assert.equal(shortcuts.get('b3'), 9)
  assert.equal(shortcuts.size, 9)
})

test('numbering stops at nine and never numbers a hidden row', () => {
  const list = makeList([...Array(12)].map((_, i) => ({ id: `s${i}` })))
  const groups = deriveGroups(
    list,
    [workspace('w1', list.ids.slice(0, 6)), workspace('w2', list.ids.slice(6))],
    [],
    [],
    new Map(),
    view(['w1', 'w2']),
  )

  const shortcuts = assignShortcuts(groups, 9)
  assert.equal(shortcuts.size, 9)
  // s5 is the sixth row of a capped five-row group, so it is not rendered.
  assert.equal(shortcuts.has('s5'), false)
  assert.equal([...shortcuts.values()].every((n) => n >= 1 && n <= 9), true)
})

test('settled conversations leave the list and free their shortcut number', () => {
  const list = makeList(['s0', 's1', 's2'].map((id) => ({ id })))
  const groups = deriveGroups(list, [workspace('w1', list.ids)], [], ['s1'], new Map(), view(['w1']))

  assert.deepEqual(groups[0].sessions.map((s) => s.id), ['s0', 's2'])
  assert.equal(groups[0].sessionCount, 2)

  const shortcuts = assignShortcuts(groups, 9)
  assert.equal(shortcuts.get('s0'), 1)
  assert.equal(shortcuts.get('s2'), 2)
  assert.equal(shortcuts.has('s1'), false)
})

test('settled conversations are excluded from search results', () => {
  const list = makeList([
    { id: 's0', title: 'deploy pipeline' },
    { id: 's1', title: 'deploy rollback' },
  ])

  const results = deriveSearchResults({
    list,
    workspaces: [workspace('w1', ['s0', 's1'])],
    query: 'deploy',
    archivedSessionIds: [],
    settledSessionIds: ['s1'],
    pendingInteractions: new Map(),
    content: { items: [], hasMore: false },
    limit: 40,
  })

  assert.deepEqual(results.items.map((r) => r.id), ['s0'])
})

test('a settled session is excluded even when host content search returns it', () => {
  const list = makeList([
    { id: 's0', title: 'alpha' },
    { id: 's1', title: 'beta' },
  ])

  const results = deriveSearchResults({
    list,
    workspaces: [workspace('w1', ['s0', 's1'])],
    query: 'zzz-only-in-message-bodies',
    archivedSessionIds: [],
    settledSessionIds: ['s1'],
    pendingInteractions: new Map(),
    // The host matched s1 on message content; settling must still hide it.
    content: { items: [{ sessionId: 's1', snippet: 'zzz' }], hasMore: false },
    limit: 40,
  })

  assert.deepEqual(results.items.map((r) => r.id), [])
})

test('archived and subagent sessions stay hidden, blank shows only when current', () => {
  const list = makeList(
    [
      { id: 's0' },
      { id: 'arch' },
      { id: 'sub', origin: 'subagent', parentId: 's0' },
      { id: 'blank1', blank: true },
      { id: 'blank2', blank: true },
    ],
    'blank2',
  )
  const groups = deriveGroups(
    list,
    [workspace('w1', ['s0', 'arch', 'sub', 'blank1', 'blank2'])],
    ['arch'],
    [],
    new Map(),
    view(['w1']),
  )

  assert.deepEqual(groups[0].sessions.map((s) => s.id), ['s0', 'blank2'])
})

test('the settled drawer lists most-recently-settled first and skips unknown ids', () => {
  const list = makeList([{ id: 's0', title: 'first' }, { id: 's1', title: 'second' }])
  const rows = deriveSettled(list, ['s1', 'gone', 's0'], [workspace('w1', ['s0', 's1'])])

  assert.deepEqual(rows.map((r) => r.id), ['s1', 's0'])
  assert.equal(rows[0].workspace, 'w1')
})

test('a collapsed group renders no rows and contributes no shortcuts', () => {
  const list = makeList([{ id: 's0' }, { id: 's1' }])
  const groups = deriveGroups(list, [workspace('w1', list.ids)], [], [], new Map(), view([]))

  assert.equal(groups[0].sessions.length, 0)
  assert.equal(groups[0].sessionCount, 2)
  assert.equal(assignShortcuts(groups, 9).size, 0)
})
