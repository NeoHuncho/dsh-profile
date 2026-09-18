window.__ModuleLoader__.load({
  id: 'dsh-quick-search',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const STYLE = `
.qfind-layer{position:fixed;inset:0;z-index:40;display:flex;align-items:flex-start;justify-content:center;padding:min(16vh,128px) 20px 24px;pointer-events:none}
.qfind-backdrop{position:absolute;inset:0;background:color-mix(in srgb,var(--dsw-alias-bg-base) 56%,transparent);pointer-events:auto}
.qfind-card{position:relative;z-index:1;width:min(620px,100%);max-height:min(620px,calc(100vh - 160px));display:flex;flex-direction:column;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);border-radius:18px;box-shadow:var(--dsw-elevation-prominent);pointer-events:auto}
.qfind-header{display:flex;align-items:center;gap:10px;padding:14px 16px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.qfind-icon{flex:none;color:var(--dsw-alias-label-tertiary);font-size:18px;line-height:1}
.qfind-input{min-width:0;flex:1;color:var(--dsw-alias-label-primary);background:transparent;border:0;outline:0;font:var(--dsw-font-s-14)}
.qfind-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.qfind-shortcut{flex:none;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 6px}
.qfind-results{min-height:0;overflow-y:auto;padding:8px}
.qfind-section{margin:4px 0 6px;padding:0 8px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);text-transform:uppercase;letter-spacing:.06em}
.qfind-row{width:100%;display:flex;align-items:center;gap:11px;padding:10px 11px;color:var(--dsw-alias-label-primary);text-align:left;background:transparent;border:0;border-radius:10px;cursor:pointer}
.qfind-row:hover,.qfind-row[data-active=true]{background:var(--dsw-alias-interactive-bg-hover)}
.qfind-row:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.qfind-row-icon{width:26px;height:26px;flex:none;display:grid;place-items:center;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;font-size:14px}
.qfind-row-copy{min-width:0;flex:1}.qfind-row-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:var(--dsw-font-s-14)}.qfind-row-detail{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12)}
.qfind-row-action{flex:none;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12)}.qfind-status{padding:18px 10px;color:var(--dsw-alias-label-tertiary);text-align:center;font:var(--dsw-font-s-14)}
.qfind-footer{display:flex;gap:14px;padding:10px 16px 12px;color:var(--dsw-alias-label-tertiary);border-top:.5px solid var(--dsw-alias-border-l1);font:var(--dsw-font-xxs-12)}.qfind-footer kbd{color:var(--dsw-alias-label-secondary)}
@media (max-width:640px){.qfind-layer{padding:12px;align-items:flex-start}.qfind-card{max-height:calc(100vh - 24px);border-radius:14px}.qfind-footer{display:none}}
`

    const has = (value, query) => typeof value === 'string' && value.toLowerCase().includes(query)

    function QuickSearch({ useSessions, useWorkspaces, sessions, uiWorkspace, timer }) {
      const sessionState = useSessions((state) => state)
      const workspaceState = useWorkspaces((state) => state) || {}
      const workspaces = Array.isArray(workspaceState) ? workspaceState : (workspaceState.items || [])
      const [open, setOpen] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [activeIndex, setActiveIndex] = React.useState(0)
      const [remoteItems, setRemoteItems] = React.useState([])
      const [remoteStatus, setRemoteStatus] = React.useState('idle')
      const [opener, setOpener] = React.useState(null)

      const close = () => {
        setOpen(false)
        setQuery('')
        if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true })
        setOpener(null)
      }

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault()
            if (!open && event.target && typeof event.target.focus === 'function') setOpener(event.target)
            setOpen(true)
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            close()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [open, opener])

      React.useEffect(() => {
        if (!open) return
        setActiveIndex(0)
        setRemoteItems([])
        const normalized = query.trim()
        if (!normalized) {
          setRemoteStatus('idle')
          return
        }
        setRemoteStatus('loading')
        const controller = new AbortController()
        const cancelTimer = timer.timeout(() => {
          sessions.search(normalized, controller.signal).then((result) => {
            if (controller.signal.aborted) return
            if (!result.ok) {
              setRemoteStatus('error')
              return
            }
            setRemoteItems(result.value.items || [])
            setRemoteStatus('ready')
          }).catch(() => {
            if (!controller.signal.aborted) setRemoteStatus('error')
          })
        }, 220)
        return () => {
          cancelTimer()
          controller.abort()
        }
      }, [open, query])

      React.useEffect(() => {
        if (!open) return
        const focusTimer = timer.timeout(() => {
          const input = document.querySelector('.qfind-input')
          if (input && typeof input.focus === 'function') input.focus({ preventScroll: true })
        }, 0)
        return focusTimer
      }, [open])

      if (!open) return null
      const normalized = query.trim().toLowerCase()
      const workspaceTitleBySession = {}
      for (const workspace of workspaces) for (const id of workspace.sessionIds || []) workspaceTitleBySession[id] = workspace.title
      const projects = workspaces.filter((workspace) => !normalized || has(workspace.title, normalized) || has(workspace.path, normalized)).map((workspace) => ({ kind: 'workspace', id: workspace.workspaceId, title: workspace.title || workspace.path, detail: normalized ? workspace.path : 'Start a new conversation in this project', action: 'New conversation' }))
      const sessionsLocal = (sessionState.ids || []).map((id) => sessionState.byId[id]).filter((session) => session && !session.blank && session.origin !== 'subagent').filter((session) => !normalized || has(session.displayTitle, normalized) || has(session.cwd, normalized) || has(workspaceTitleBySession[session.id], normalized)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map((session) => ({ kind: 'session', id: session.id, title: session.displayTitle || session.title || session.id, detail: workspaceTitleBySession[session.id] || session.cwd || 'Agent session', action: 'Open session' }))
      const sessionsRemote = []
      const seen = new Set(sessionsLocal.map((row) => row.id))
      for (const item of remoteItems) {
        const session = sessionState.byId[item.sessionId]
        if (!session || session.blank || session.origin === 'subagent' || seen.has(session.id)) continue
        seen.add(session.id)
        sessionsRemote.push({ kind: 'session', id: session.id, title: session.displayTitle || session.title || session.id, detail: item.snippet || workspaceTitleBySession[session.id] || session.cwd || 'Agent session', action: 'Open session' })
      }
      const rows = [...projects, ...sessionsLocal, ...sessionsRemote].slice(0, 24)
      const choose = (row) => {
        close()
        if (row.kind === 'workspace') uiWorkspace.startSession(row.id)
        else uiWorkspace.openSession(row.id)
      }
      const onInputKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActiveIndex((index) => rows.length ? (index + 1) % rows.length : 0)
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActiveIndex((index) => rows.length ? (index - 1 + rows.length) % rows.length : 0)
        } else if (event.key === 'Enter' && rows[activeIndex]) {
          event.preventDefault()
          choose(rows[activeIndex])
        } else if (event.key === 'Escape') {
          event.preventDefault()
          close()
        }
      }
      let index = 0
      const renderRow = (row) => {
        const rowIndex = index++
        return React.createElement('button', { className: 'qfind-row', type: 'button', key: `${row.kind}-${row.id}`, 'data-active': rowIndex === activeIndex ? 'true' : 'false', onMouseEnter: () => setActiveIndex(rowIndex), onClick: () => choose(row) }, React.createElement('span', { className: 'qfind-row-icon', 'aria-hidden': 'true' }, row.kind === 'workspace' ? '⌂' : '↗'), React.createElement('span', { className: 'qfind-row-copy' }, React.createElement('span', { className: 'qfind-row-title' }, row.title), React.createElement('span', { className: 'qfind-row-detail' }, row.detail)), React.createElement('span', { className: 'qfind-row-action' }, row.action))
      }
      const children = []
      if (projects.length) {
        children.push(React.createElement('div', { className: 'qfind-section', key: 'projects-heading' }, 'Projects'))
        children.push(...projects.map(renderRow))
      }
      if (sessionsLocal.length + sessionsRemote.length) {
        children.push(React.createElement('div', { className: 'qfind-section', key: 'sessions-heading' }, 'Agent sessions'))
        children.push(...[...sessionsLocal, ...sessionsRemote].map(renderRow))
      }
      if (!children.length) children.push(React.createElement('div', { className: 'qfind-status', key: 'empty' }, remoteStatus === 'loading' ? 'Searching sessions…' : remoteStatus === 'error' ? 'Session search is unavailable' : 'No projects or sessions match that search.'))
      return React.createElement('div', { className: 'qfind-layer' }, React.createElement('div', { className: 'qfind-backdrop', onMouseDown: close }), React.createElement('section', { className: 'qfind-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Quick search', onMouseDown: (event) => event.stopPropagation() }, React.createElement('div', { className: 'qfind-header' }, React.createElement('span', { className: 'qfind-icon', 'aria-hidden': 'true' }, '⌕'), React.createElement('input', { className: 'qfind-input', type: 'search', autoFocus: true, value: query, onChange: (event) => setQuery(event.target.value), onKeyDown: onInputKeyDown, placeholder: 'Search projects and agent sessions…', 'aria-label': 'Search projects and agent sessions' }), React.createElement('kbd', { className: 'qfind-shortcut' }, '⌘K / Ctrl K')), React.createElement('div', { className: 'qfind-results', role: 'listbox', 'aria-label': 'Search results' }, children), React.createElement('div', { className: 'qfind-footer' }, React.createElement('span', null, React.createElement('kbd', null, '↑↓'), ' navigate'), React.createElement('span', null, React.createElement('kbd', null, 'Enter'), ' open'), React.createElement('span', null, React.createElement('kbd', null, 'Esc'), ' close'))))
    }

    function apply(ctx) {
      const sessions = ctx.get('sessions')
      const uiWorkspace = ctx.get('uiWorkspace')
      const slots = ctx.get('slots') || ctx.slots
      const timer = ctx.get('timer')
      if (!sessions || !uiWorkspace || !slots || !timer) {
        console.error('[dsh-quick-search] waiting for client services', { sessions: !!sessions, uiWorkspace: !!uiWorkspace, slots: !!slots, timer: !!timer })
        return
      }
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-quick-search'
      style.textContent = STYLE
      document.head.append(style)
      ctx.effect(() => () => style.remove(), 'quick-search: styles')
      slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'quick-search', order: 80, label: 'Quick search' }, (props) => React.createElement(QuickSearch, { ...props, sessions, uiWorkspace, timer })))
    }

    const plugin = { inject: ['slots', 'sessions', 'uiWorkspace', 'timer'], apply }
    module.exports = plugin
    return plugin
  }
})
