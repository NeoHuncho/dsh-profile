/**
 * Split-pane layout model for the terminal panel.
 *
 * A tab's panes form a binary tree, the same model VS Code and tmux use:
 *
 *   node = { kind: 'leaf', id }
 *        | { kind: 'split', dir: 'row'|'column', ratio, a: node, b: node }
 *
 * 'row' places children left|right, 'column' places them top|bottom.
 *
 * Pure data + pure functions: no React and no DOM, so the tree can be reasoned
 * about and unit-tested on its own. The renderer walks it; these helpers never
 * touch the terminal instances themselves.
 */

/** A fresh single-pane tree. */
export function leaf(id) {
  return { kind: 'leaf', id }
}

/** Every pane id in the tree, left-to-right / top-to-bottom. */
export function paneIds(node) {
  if (node === null || node === undefined) return []
  if (node.kind === 'leaf') return [node.id]
  return [...paneIds(node.a), ...paneIds(node.b)]
}

/** Count of panes in the tree. */
export function paneCount(node) {
  return paneIds(node).length
}

/**
 * Split the pane `targetId` in `dir`, putting `newId` in the second half.
 * Returns a NEW tree; the input is never mutated.
 */
export function splitPane(node, targetId, dir, newId) {
  if (node === null || node === undefined) return leaf(newId)
  if (node.kind === 'leaf') {
    if (node.id !== targetId) return node
    return { kind: 'split', dir, ratio: 0.5, a: leaf(node.id), b: leaf(newId) }
  }
  return {
    ...node,
    a: splitPane(node.a, targetId, dir, newId),
    b: splitPane(node.b, targetId, dir, newId),
  }
}

/**
 * Remove pane `targetId`, collapsing its parent split into the surviving side.
 * Returns null when the tree becomes empty.
 */
export function removePane(node, targetId) {
  if (node === null || node === undefined) return null
  if (node.kind === 'leaf') return node.id === targetId ? null : node
  const a = removePane(node.a, targetId)
  const b = removePane(node.b, targetId)
  if (a === null) return b
  if (b === null) return a
  return { ...node, a, b }
}

/** Set the ratio of the split identified by `path` ('' = root, then 'a'/'b' steps). */
export function setRatio(node, path, ratio) {
  if (node === null || node === undefined || node.kind === 'leaf') return node
  const clamped = Math.min(Math.max(ratio, 0.1), 0.9)
  if (path.length === 0) return { ...node, ratio: clamped }
  const [step, ...rest] = path
  if (step === 'a') return { ...node, a: setRatio(node.a, rest, ratio) }
  return { ...node, b: setRatio(node.b, rest, ratio) }
}

/** The pane after `currentId` in visual order, wrapping around. */
export function nextPane(node, currentId) {
  const ids = paneIds(node)
  if (ids.length === 0) return null
  const index = ids.indexOf(currentId)
  if (index === -1) return ids[0]
  return ids[(index + 1) % ids.length]
}

/** The pane before `currentId` in visual order, wrapping around. */
export function prevPane(node, currentId) {
  const ids = paneIds(node)
  if (ids.length === 0) return null
  const index = ids.indexOf(currentId)
  if (index === -1) return ids[0]
  return ids[(index - 1 + ids.length) % ids.length]
}
