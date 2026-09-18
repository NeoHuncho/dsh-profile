/**
 * dsh-sidebar-tray — host half.
 *
 * Owns the durable "settled" conversation list.
 *
 * Settling is deliberately NOT the harness's own archive. `workspaceRegistry`
 * exposes `archiveSession` but no un-archive: the registry-global archive set
 * is append-only, so building a reversible "settle / unsettle" affordance on
 * top of it would be a one-way door. Instead this plugin keeps its own ordered
 * id list in the user's settings document (`~/.dsh/settings.yaml` under
 * `sidebar-tray:`), which is reversible, survives harness restarts, and is the
 * same on every browser that talks to this host.
 *
 * The browser half reaches this state through the ordinary settings Remote
 * (`ctx.remote.settings`), so no bespoke route or socket is introduced here.
 */

import z from '@deepseek-ai/schemastery'

export const name = 'dsh-sidebar-tray'

/** The settings service owns the durable document; nothing else is required. */
export const inject = ['settings']

const SETTINGS_NS = 'sidebar-tray'

const SettingsSchema = z.object({
  /**
   * Settled session ids, most recently settled FIRST. Order is meaningful: the
   * drawer shows the five most recent and hides the rest behind "Show more".
   */
  settledSessionIds: z.array(z.string()).default([]),
  /** Reveal the row shortcut badges while Ctrl+Shift is held. */
  shortcutsEnabled: z.boolean().default(true),
  /** Rows shown per workspace group before "Show more". */
  sessionsPerWorkspace: z.number().default(5),
  /** Rows shown in the settled drawer before "Show more". */
  settledPreviewCount: z.number().default(5),
  /**
   * User-created Spaces (Arc/Zen style). Each Space lists the workspace ids it
   * owns; every workspace not claimed by a Space belongs to the built-in
   * Default space, which is therefore never stored here.
   */
  spaces: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        /** Single emoji shown in the space dock. */
        emoji: z.string().default('📁'),
        workspaceIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  /** Display of the built-in Default space (it is never stored as a space). */
  defaultSpace: z.object({ name: z.string().default('Default'), emoji: z.string().default('🏠') }).default({}),
  /** The Space currently shown in the sidebar; `default` is the built-in one. */
  activeSpaceId: z.string().default('default'),
})

export function apply(ctx) {
  // Registering the namespace is an effect on this plugin's own fiber: unload
  // withdraws the namespace and its observers, leaving the document untouched.
  ctx.settings.register(SETTINGS_NS, SettingsSchema, { applies: 'live' })
}
