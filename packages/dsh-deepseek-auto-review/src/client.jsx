import React from 'react'

export const inject = ['slots']

const FALLBACK = {
  label: 'DSH Review',
  title: 'DSH Auto Review',
  unavailable: 'Review projection unavailable.',
  enabled: 'ON',
  disabled: 'OFF',
  reviewer: 'Reviewer',
}

function installStyles() {
  if (typeof document === 'undefined') return () => undefined
  if (document.querySelector('style[data-dsh-deepseek-auto-review]')) return () => undefined
  const tag = document.createElement('style')
  tag.dataset.dshDeepseekAutoReview = 'panel'
  tag.textContent = `
[data-dsh-deepseek-auto-review]{font-family:inherit;color:var(--dsw-color-text,#1f2328)}
[data-dsh-deepseek-auto-review-button]{display:inline-flex;align-items:center;cursor:pointer;background:transparent;border:1px solid var(--dsw-color-border,rgba(128,128,128,.3));border-radius:6px;padding:3px 8px;font-size:12px;color:inherit}
[data-dsh-deepseek-auto-review-panel]{position:absolute;z-index:40;min-width:320px;max-width:440px;max-height:70vh;overflow-y:auto;background:var(--dsw-color-surface,#fff);border:1px solid var(--dsw-color-border,rgba(128,128,128,.3));border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:12px;font-size:12px;line-height:1.5}
[data-dsh-deepseek-auto-review-row]{display:flex;justify-content:space-between;gap:8px;padding:3px 0}
[data-dsh-deepseek-auto-review-title]{font-weight:600;margin-bottom:6px}
[data-dsh-deepseek-auto-review-section]{border-top:1px solid var(--dsw-color-border,rgba(128,128,128,.3));margin:8px 0;padding-top:8px}
[data-dsh-deepseek-auto-review-muted]{color:var(--dsw-color-text-muted,#6b7280)}
[data-dsh-deepseek-auto-review-allow]{color:var(--dsw-color-success,#16a34a)}
[data-dsh-deepseek-auto-review-deny]{color:var(--dsw-color-danger,#dc2626)}
[data-dsh-deepseek-auto-review-failed]{color:var(--dsw-color-warning,#b45309)}
`
  document.head.appendChild(tag)
  return () => tag.remove()
}

/**
 * Session-header status entry.
 *
 * It shows only the `deepseekAutoReview` projection's whole value — the policy
 * in force. Per-turn counters and the recent verdict ring are host runtime
 * state with no committed session event behind them, so they are deliberately
 * absent rather than rendered from a value the host cannot publish.
 */
function Panel({ useProjection }) {
  const [open, setOpen] = React.useState(false)
  const value = typeof useProjection === 'function' ? useProjection('deepseekAutoReview') : undefined
  if (!value) return null
  return React.createElement('div', { 'data-dsh-deepseek-auto-review': true },
    React.createElement('button', { type: 'button', 'data-dsh-deepseek-auto-review-button': true, 'aria-expanded': open, onClick: () => setOpen(previous => !previous) }, FALLBACK.label),
    open && React.createElement('div', { 'data-dsh-deepseek-auto-review-panel': true },
      React.createElement('div', { 'data-dsh-deepseek-auto-review-title': true }, FALLBACK.title),
      React.createElement('div', { 'data-dsh-deepseek-auto-review-row': true }, React.createElement('span', null, 'State'), React.createElement('strong', null, value.enabled ? FALLBACK.enabled : FALLBACK.disabled)),
      React.createElement('div', { 'data-dsh-deepseek-auto-review-row': true }, React.createElement('span', null, FALLBACK.reviewer), React.createElement('span', { 'data-dsh-deepseek-auto-review-muted': true }, `${value.reviewerProvider} / ${value.reviewerModel} (${value.reasoningEffort})`)),
      React.createElement('div', { 'data-dsh-deepseek-auto-review-section': true },
        React.createElement('div', { 'data-dsh-deepseek-auto-review-muted': true }, 'Each reviewed action is reported inline on the tool call it governs.'),
      ),
    ),
  )
}

export function apply(ctx) {
  ctx.effect(() => installStyles(), 'dsh-auto-review: styles')
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-auto-review', order: 40 }, Panel))
}
