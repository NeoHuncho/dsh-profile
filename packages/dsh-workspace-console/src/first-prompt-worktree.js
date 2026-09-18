/**
 * Deferred worktree creation: the first prompt of a blank conversation that
 * was opened on an env-enabled project (one with `.agents/env.json`) creates
 * the worktree environment *at send time* and hops the prompt into a new
 * session whose cwd is that worktree — unless the "Start on a new worktree"
 * toggle in the composer dock is off.
 *
 * Nothing is created when a conversation is merely opened. This mirrors what
 * the shipped composer does when the workspace chip is switched before the
 * first message: the draft moves to the blank session of the other workspace.
 *
 * Implementation: the shipped composer's default sink calls
 * `conversation.sendSession(session, text, attachmentIds, mode, signal)`;
 * that instance method is shadowed (and restored on dispose). Interception
 * only happens for blank sessions whose cwd is an env project root.
 */

import { envStore, newWorktreeChoice, refreshEnvs } from './env-store.js'

/**
 * @param ctx client context (needs `conversation`, `sessions`, `uiWorkspace`)
 * @returns disposer
 */
export function installFirstPromptWorktree(ctx) {
  const conversation = ctx.get('conversation')
  const sessions = ctx.get('sessions')
  const uiWorkspace = ctx.get('uiWorkspace')
  if (conversation === undefined || sessions === undefined || uiWorkspace === undefined) {
    console.warn('[workspace-console] first-prompt worktree hop unavailable (conversation/sessions/uiWorkspace missing)')
    return () => {}
  }
  const original = conversation.sendSession
  if (typeof original !== 'function') return () => {}

  // Source session id → promise of the target session id, so a second prompt
  // fired while the hop is in flight lands in the same new session.
  const hops = new Map()

  async function hop(sourceId, projectWorkspaceId) {
    const inflight = hops.get(sourceId)
    if (inflight !== undefined) return inflight
    const attempt = (async () => {
      const env = await envStore.createForWorkspace(projectWorkspaceId)
      if (!env?.childWorkspaceId) throw new Error('environment was created without a workspace')
      const targetId = await sessions.create({ workspaceId: env.childWorkspaceId, cwd: env.dir })
      return targetId
    })()
    hops.set(sourceId, attempt)
    attempt.catch(() => hops.delete(sourceId))
    return attempt
  }

  async function sendSession(session, text, attachmentIds, mode, signal) {
    const sourceId = session?.sessionId
    const summary = sourceId ? sessions.list.getSnapshot()?.byId?.[sourceId] : undefined
    const projectWorkspaceId = summary?.blank ? envStore.projectForCwd(summary.cwd) : undefined
    if (projectWorkspaceId === undefined || !newWorktreeChoice.get(sourceId)) {
      return original.call(conversation, session, text, attachmentIds, mode, signal)
    }

    let targetId
    try {
      targetId = await hop(sourceId, projectWorkspaceId)
    } catch (error) {
      const message = String(error?.message ?? error)
      window.alert(`Could not create a worktree environment:\n${message}\n\nYour message was not sent. Untick "Start on a new worktree" to work in the main checkout instead.`)
      throw new Error(`worktree environment: ${message}`)
    }
    const target = sessions.binding(targetId)?.session
    if (target === undefined) throw new Error('worktree environment: new session has no binding yet, please send again')
    if (attachmentIds.length > 0) conversation.rebindDraftFiles(targetId, attachmentIds)
    const outcome = await original.call(conversation, target, text, attachmentIds, mode, signal)
    if (outcome?.kind === 'success') {
      uiWorkspace.openSession(targetId)
      void refreshEnvs()
    }
    return outcome
  }

  conversation.sendSession = sendSession
  return () => {
    if (conversation.sendSession === sendSession) conversation.sendSession = original
    hops.clear()
  }
}
