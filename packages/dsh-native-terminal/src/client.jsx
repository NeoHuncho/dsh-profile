/**
 * dsh-native-terminal — client entry.
 *
 * Registers two additive surfaces, neither of which replaces shipped UI:
 *
 *  - the terminal dock, in `conversation.input.dock` (full-width, above the
 *    composer, so it sits at the bottom of the conversation column);
 *  - the Quick chats group, in `sidebar.footer.action` at a high `order` so it
 *    lands directly above Settings.
 */

import React from 'react'

import { TerminalPanel } from './client-panel.jsx'
import { createQuickChatsAction } from './client-quickchats.jsx'
import panelCss from './panel.css?raw'
import quickChatsCss from './quickchats.css?raw'

/**
 * Hard dependency only. `workspaces` and `uiWorkspace` are read with
 * `ctx.get()` inside apply(), so a host that does not mount them degrades the
 * Quick chats group rather than leaving this whole plugin pending.
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
  ctx.effect(() => installStyles('panel', panelCss), 'native-terminal: panel styles')
  ctx.effect(() => installStyles('quickchats', quickChatsCss), 'native-terminal: quickchats styles')

  // ── terminal dock ─────────────────────────────────────────────────────────
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'native-terminal', order: 100 },
      (props) => {
        // Run the panel in the workspace directory of the open session when we
        // can see one, so a new terminal starts where the user is working.
        const cwd = props?.useSession?.((s) => s?.header?.cwd) ?? undefined
        return <TerminalPanel cwd={cwd} />
      },
    ),
  )

  // ── quick chats ───────────────────────────────────────────────────────────
  //
  // Resolve the services LAZILY, per call. Reading them once here captures
  // whatever exists at apply() time — and this plugin activates before
  // `workspaces`/`uiWorkspace` mount, so an eager read pins `undefined`
  // forever and every click reports "workspace services unavailable".
  const QuickChats = createQuickChatsAction({
    get workspaces() {
      return ctx.get('workspaces')
    },
    get uiWorkspace() {
      return ctx.get('uiWorkspace')
    },
  })

  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      // A high order keeps this directly above the Settings row.
      { name: 'sidebar.footer.action', id: 'quick-chats', order: 900 },
      (props) => <QuickChats {...props} />,
    ),
  )
}
