/**
 * dsh-native-terminal — client entry.
 *
 * Registers one additive surface, without replacing shipped UI:
 *
 *  - the terminal dock, in `conversation.input.dock` (full-width, above the
 *    composer, so it sits at the bottom of the conversation column).
 */

import React from 'react'

import { TerminalPanel } from './client-panel.jsx'
import { WorkspaceActions } from './workspace-actions.jsx'
import { EnvActions } from './env-actions.jsx'
import { installEnvBridge } from './env-store.js'
import panelCss from './panel.css?raw'
import workspaceActionsCss from './workspace-actions.css?raw'

/**
 * The terminal dock only requires the browser slot registry.
 */
export const inject = ['slots']

/** Inject a stylesheet once, tagged for easy identification in devtools. */
function installStyles(id, css) {
  if (typeof document === 'undefined') return () => {}
  const existing = document.querySelector(`style[data-dsh-native-terminal="${id}"]`)
  if (existing !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.dshNativeTerminal = id
  tag.textContent = css
  document.head.appendChild(tag)
  return () => tag.remove()
}

export function apply(ctx) {
  ctx.effect(() => installStyles('panel', panelCss), 'workspace-console: panel styles')
  ctx.effect(() => installStyles('workspace-actions', workspaceActionsCss), 'workspace-console: workspace action styles')
  // Worktree environments: poller + window bridge used by the sidebar tray.
  ctx.effect(() => installEnvBridge(), 'workspace-console: environment bridge')

  // ── terminal dock ─────────────────────────────────────────────────────────
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'native-terminal', order: 100 },
      (props) => {
        // Start terminals in the current workspace directory.
        //
        // The cwd is NOT on the session snapshot — that snapshot carries only
        // run state (running/blank/queue/…) and has no `header` at all, which
        // is why reading `header.cwd` always yielded undefined and the host
        // fell back to the home directory. The sessions store is what holds it,
        // keyed by session id.
        const sessionId = props?.sessionId
        const cwd =
          props?.useSessions?.((store) => {
            const id = sessionId ?? store?.current
            if (id === undefined || id === null) return undefined
            return store?.byId?.[id]?.cwd
          }) ?? undefined
        return <>
          <TerminalPanel cwd={cwd} />
          {props?.session?.blank ? <WorkspaceActions cwd={cwd} variant="hero" /> : null}
        </>
      },
    ),
  )

  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.utilities',
        id: 'workspace-actions',
        order: -20,
      },
      (props) => <WorkspaceActions {...props} />,
    ),
  )

  // Environment Start/Stop/Restart, only for sessions living in a worktree env.
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.utilities',
        id: 'env-actions',
        order: -30,
      },
      (props) => <EnvActions {...props} />,
    ),
  )

}
