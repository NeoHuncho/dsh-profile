/**
 * "Start on a new worktree" toggle, shown above the composer for a blank
 * conversation opened on an env-enabled project root. Ticked by default; the
 * first prompt then creates a worktree environment and hops into it (see
 * first-prompt-worktree.js). Unticked, the conversation stays in the main
 * checkout.
 */

import React, { useSyncExternalStore } from 'react'

import { envStore, newWorktreeChoice } from './env-store.js'

export function EnvNewWorktreeToggle({ sessionId, blank, cwd }) {
  useSyncExternalStore(envStore.subscribe, envStore.getSnapshot)
  const checked = useSyncExternalStore(newWorktreeChoice.subscribe, () => newWorktreeChoice.get(sessionId))
  const projectId = blank && cwd ? envStore.projectForCwd(cwd) : undefined
  if (projectId === undefined || !sessionId) return null
  const project = envStore.getSnapshot().projects[projectId]
  const label = project?.label ?? 'worktree'
  return (
    <label className="dshEnvNewWorktree" title="Your first message creates a fresh git worktree (own branch, ports and database) and the conversation continues there. Untick to work directly in the main checkout.">
      <input type="checkbox" checked={checked} onChange={(event) => newWorktreeChoice.set(sessionId, event.target.checked)} />
      <span>Start on a new {label === 'worktree' ? 'worktree' : `${label} worktree`}</span>
      <span className="dshEnvNewWorktreeHint">{checked ? 'created when you send your first message' : 'working in the main checkout'}</span>
    </label>
  )
}
