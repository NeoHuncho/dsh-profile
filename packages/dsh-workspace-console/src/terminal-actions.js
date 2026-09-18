/**
 * In-process bridge between workspace action buttons and the mounted native
 * terminal panel. The panel owns PTY allocation; callers only enqueue a
 * command for the focused pane.
 */

const listeners = new Set()
let actionSeq = 0

export function subscribeTerminalActions(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function requestTerminalAction(action) {
  const envelope = {
    id: action?.id ?? `action-${++actionSeq}`,
    command: action?.command ?? '',
    name: action?.name ?? 'Workspace action',
    cwd: action?.cwd ?? ''
  }
  for (const listener of listeners) {
    try {
      listener(envelope)
    } catch {
      // One stale pane must not prevent another pane from receiving a click.
    }
  }
}
