/**
 * Environment controls in the conversation header.
 *
 * Shown only when the session's cwd is a worktree environment. While the env
 * is not running there is a single **Start environment** button; while it
 * runs, Stop / Restart plus the port list. `Logs` opens the last 200 lines.
 */

import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { envStore } from './env-store.js'

export function EnvActions({ sessionId, useSessions, cwd: explicitCwd }) {
  const storeCwd = useSessions?.((state) => state?.byId?.[sessionId]?.cwd)
  const cwd = explicitCwd || storeCwd
  const snap = useSyncExternalStore(envStore.subscribe, envStore.getSnapshot)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [log, setLog] = useState(null)

  const env = cwd ? envStore.envFor({ cwd }) : undefined
  const tornDown = cwd && !env ? envStore.tornDownFor(cwd) : undefined
  void snap

  useEffect(() => { setError('') }, [cwd])

  if (!cwd || (!env && !tornDown)) return null

  const act = async (action) => {
    setBusy(action)
    setError('')
    try {
      await envStore.act((env ?? tornDown).id, action)
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy('')
    }
  }

  const showLog = async () => {
    try { setLog(await envStore.log((env ?? tornDown).id)) } catch (err) { setError(String(err?.message ?? err)) }
  }

  const ports = env?.ports?.length ? env.ports.join(', ') : ''
  const title = `${env?.slug ?? tornDown.slug} · ${env?.branch ?? tornDown.branch}${ports ? ` · ports ${ports}` : ''}`

  return <>
    <div className="dshEnvActions" role="group" aria-label="Environment" title={title}>
      <span className={`dshEnvDot dshEnvDot-${env ? env.state : 'torn-down'}`} aria-hidden="true" />
      <span className="dshEnvSlug">{env?.slug ?? tornDown.slug}</span>
      {tornDown
        ? <button type="button" className="dshEnvButton" disabled={busy !== ''} onClick={() => act('restore')}>{busy === 'restore' ? 'Restoring…' : 'Restore environment'}</button>
        : env.state === 'running'
          ? <>
            {ports ? <span className="dshEnvPorts">{env.ports.map((p) => <a key={p} href={`http://localhost:${p}`} target="_blank" rel="noreferrer">:{p}</a>)}</span> : null}
            <button type="button" className="dshEnvButton" disabled={busy !== ''} onClick={() => act('restart')} title="Restart environment">{busy === 'restart' ? '…' : '↻'}</button>
            <button type="button" className="dshEnvButton dshEnvButton-stop" disabled={busy !== ''} onClick={() => act('stop')} title="Stop environment">{busy === 'stop' ? '…' : '■'}</button>
          </>
          : <button type="button" className="dshEnvButton dshEnvButton-start" disabled={busy !== ''} onClick={() => act('start')}>{busy === 'start' ? 'Starting…' : '▶ Start environment'}</button>}
      <button type="button" className="dshEnvButton dshEnvButton-quiet" onClick={showLog} title="Environment logs">≣</button>
      {error ? <span className="dshEnvError" title={error}>⚠</span> : null}
    </div>
    {log !== null ? createPortal(
      <div className="dshWaBackdrop" onClick={() => setLog(null)}>
        <div className="dshWaEditor dshEnvLog" onClick={(e) => e.stopPropagation()}>
          <header><div><h2>Environment log</h2><p>{title}</p></div><button type="button" onClick={showLog}>Refresh</button><button type="button" onClick={() => setLog(null)}>Close</button></header>
          <pre>{log || '(empty)'}</pre>
        </div>
      </div>,
      document.body,
    ) : null}
  </>
}
