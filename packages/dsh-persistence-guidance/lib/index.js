/**
 * Profile-wide guidance for durable feature and plugin work.
 *
 * This is intentionally a host/global system-prompt contribution rather than a
 * preset row, so every agent preset mounted by the web profile inherits it.
 */

export const name = 'dsh-persistence-guidance'
export const inject = ['systemPrompt']

export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'profile:persistence-guidance',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 1,
    text: [
      'Persistence rule: when creating a plugin or feature, prefer repository-backed or otherwise persistent implementation and configuration so it survives DeepSeek Harness resets and restarts.',
      'Use a temporary dynamic Cordis plugin only when the user explicitly asks for a session-only experiment or runtime extension.',
    ].join(' '),
  }), 'persistence-guidance.section()')
}
