import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveGroups } from '../src/derive.js'
import { DEFAULT_SPACE_ID, deriveSpaces, normalizeSpaces, spaceInitials, spaceOfWorkspace } from '../src/spaces.js'

const ws = (id) => ({ workspaceId: id, path: `/tmp/${id}`, title: id, sessionIds: [] })

test('unclaimed workspaces belong to Default; claimed ones to their space', () => {
  const spaces = [{ id: 'work', name: 'Work', workspaceIds: ['b'] }]
  const derived = deriveSpaces(spaces, [ws('a'), ws('b'), ws('c')])
  assert.deepEqual(derived.map((s) => s.id), [DEFAULT_SPACE_ID, 'work'])
  assert.deepEqual(derived[0].workspaces.map((w) => w.workspaceId), ['a', 'c'])
  assert.deepEqual(derived[1].workspaces.map((w) => w.workspaceId), ['b'])
  assert.equal(derived[0].builtin, true)
})

test('an environment child workspace follows its parent space', () => {
  const spaces = [{ id: 'work', name: 'Work', workspaceIds: ['b'] }]
  const parentOf = (w) => (w.workspaceId === 'b-env' ? 'b' : undefined)
  const derived = deriveSpaces(spaces, [ws('a'), ws('b'), ws('b-env')], { parentOf })
  assert.deepEqual(derived[1].workspaces.map((w) => w.workspaceId), ['b', 'b-env'])
})

test('normalizeSpaces drops duplicates, the reserved default id and junk', () => {
  const out = normalizeSpaces([
    { id: 'x', name: 'X', workspaceIds: ['a', 'a', 3] },
    { id: 'x', name: 'dup' },
    { id: 'default', name: 'nope' },
    null,
    { id: 'y', name: '' },
  ])
  assert.deepEqual(out, [
    { id: 'x', name: 'X', workspaceIds: ['a'] },
    { id: 'y', name: 'Space', workspaceIds: [] },
  ])
})

test('spaceOfWorkspace and initials', () => {
  const spaces = [{ id: 'w', name: 'Harness Lab', workspaceIds: ['a'] }]
  assert.equal(spaceOfWorkspace(spaces, 'a'), 'w')
  assert.equal(spaceOfWorkspace(spaces, 'zzz'), DEFAULT_SPACE_ID)
  assert.equal(spaceInitials('Harness Lab'), 'HL')
  assert.equal(spaceInitials('Work'), 'WO')
})

test('deriveGroups hides stray sessions when includeStray is false', () => {
  const list = { ids: ['s1'], byId: { s1: { id: 's1', displayTitle: 'stray', updatedAt: 1 } }, current: undefined }
  const shown = deriveGroups(list, [], [], [], new Map(), { expandedGroups: [''], shownGroups: [], perGroup: 5 })
  const hidden = deriveGroups(list, [], [], [], new Map(), { expandedGroups: [''], shownGroups: [], perGroup: 5, includeStray: false })
  assert.equal(shown.length, 1)
  assert.equal(hidden.length, 0)
})
