'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { roundView } from '@/lib/nets/rotation'
import type { NetSnapshot } from '@/lib/nets/snapshot'
import { clock, timerView, type TimerInput } from '@/lib/nets/timer'
import { ConfirmButton } from '@/components/selector/confirm-button'
import { btnPrimary, btnQuiet } from '@/components/selector/styles'

/**
 * The rotation timer (wave B spec 4.3). It renders from the server's snapshot plus a clock corrected by the server's time, so a
 * second phone, a reload or a tab that was throttled in the background all agree: the round is computed from stored timestamps, never
 * from counting ticks. It ticks every 250 ms only while the tab is visible, refetches the state when the tab comes back and after
 * each action, and asks for a screen wake lock while running (where the browser has one). The countdown is a `role="timer"` with
 * `aria-live="off"`; a separate polite status speaks only when the round changes.
 */
export type SnapshotResult = { ok: true; snapshot: NetSnapshot } | { ok: false; error: string }
export type TimerActions = {
  build: (input: { sessionId: number }) => Promise<SnapshotResult>
  start: (input: { sessionId: number }) => Promise<SnapshotResult>
  pause: (input: { sessionId: number }) => Promise<SnapshotResult>
  resume: (input: { sessionId: number }) => Promise<SnapshotResult>
  next: (input: { sessionId: number }) => Promise<SnapshotResult>
  finish: (input: { sessionId: number }) => Promise<SnapshotResult>
}

const inputOf = (s: NetSnapshot): TimerInput => ({ state: s.state, round: s.round, roundStartedAt: s.roundStartedAt, pausedAt: s.pausedAt, minutes: s.minutesPerTurn, rounds: s.rounds })

type WakeLockSentinelLike = { release: () => Promise<void> }
type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }

export function RotationTimer({ initial, actions, statePath, canBuild }: { initial: NetSnapshot; actions: TimerActions; statePath: string; canBuild: boolean }) {
  const router = useRouter()
  const [snap, setSnap] = useState(initial)
  // The offset between the server's clock and this device's, fixed when the snapshot arrived.
  const offset = useRef(0)
  // The first render uses the server's own time so the server and client markup match; the effect below switches to the device clock.
  const [now, setNow] = useState(initial.serverNow)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const adopt = useCallback((next: NetSnapshot) => {
    offset.current = next.serverNow - Date.now()
    setSnap((cur) => (next.revision >= cur.revision ? next : cur))
    setNow(Date.now() + offset.current)
  }, [])

  // A newer snapshot from the page (a refresh after a late check-in changed the plan) replaces ours; adjusted during render, not in an effect.
  const [seen, setSeen] = useState(initial)
  if (seen !== initial) {
    setSeen(initial)
    if (initial.revision >= snap.revision) setSnap(initial)
  }
  // Fix the device-to-server clock offset on arrival of a snapshot, then show the corrected time.
  useEffect(() => {
    offset.current = initial.serverNow - Date.now()
    const t = setTimeout(() => setNow(Date.now() + offset.current), 0)
    return () => clearTimeout(t)
  }, [initial])

  const view = useMemo(() => timerView(inputOf(snap), now), [snap, now])
  const running = view.phase === 'running'

  // Tick only while the tab is visible.
  useEffect(() => {
    if (!running) return
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id == null) id = setInterval(() => setNow(Date.now() + offset.current), 250)
    }
    const stop = () => {
      if (id != null) clearInterval(id)
      id = null
    }
    const onVis = () => (document.visibilityState === 'visible' ? (setNow(Date.now() + offset.current), start()) : stop())
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [running])

  // Refetch when the tab comes back, so a backgrounded or second-phone change shows up.
  const refetch = useCallback(async () => {
    try {
      const res = await fetch(statePath, { cache: 'no-store', headers: { Accept: 'application/json' } })
      if (res.ok) adopt((await res.json()) as NetSnapshot)
    } catch {
      /* offline: keep the last snapshot; the countdown still runs from its timestamps */
    }
  }, [statePath, adopt])
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refetch])

  // A screen wake lock while running, where the browser supports one. Without it this is a plain countdown.
  useEffect(() => {
    const nav = navigator as NavigatorWithWakeLock
    if (!running || !nav.wakeLock) return
    let lock: WakeLockSentinelLike | null = null
    let cancelled = false
    const ask = async () => {
      try {
        const l = await nav.wakeLock!.request('screen')
        if (cancelled) await l.release().catch(() => undefined)
        else lock = l
      } catch {
        /* refused (battery saver, permissions): fine */
      }
    }
    void ask()
    const onVis = () => {
      if (document.visibilityState === 'visible' && !lock) void ask()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release().catch(() => undefined)
      lock = null
    }
  }, [running])

  const run = async (fn: (input: { sessionId: number }) => Promise<SnapshotResult>) => {
    setBusy(true)
    setMessage('')
    try {
      const res = await fn({ sessionId: snap.id })
      if (res.ok) {
        adopt(res.snapshot)
        router.refresh()
      } else {
        setMessage(res.error)
        await refetch()
      }
    } catch {
      setMessage('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const plan = snap.plan
  const rv = plan ? roundView(plan, view.round) : null
  const names = (ps: { name: string }[]) => ps.map((p) => p.name).join(', ')
  const announce = view.phase === 'running' || view.phase === 'paused' ? `Round ${view.round + 1} of ${snap.rounds}` : view.phase === 'done' ? 'Rotation complete' : ''

  if (!plan || !plan.groups.length) {
    return (
      <div>
        <p className="text-sm text-brand-grey">No rotation yet. Check players in, then build it.</p>
        {canBuild && snap.state === 'planned' && <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => run(actions.build)}>Build rotation</button>}
        {message && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{message}</p>}
      </div>
    )
  }

  return (
    <div>
      <p role="status" className="sr-only">{announce}</p>
      <div className="rounded-xl bg-brand-black p-5 text-center text-white">
        <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
          {view.phase === 'not-started' ? `${snap.rounds} ${snap.rounds === 1 ? 'round' : 'rounds'} of ${snap.minutesPerTurn} minutes` : view.phase === 'done' ? 'Rotation complete' : `Round ${view.round + 1} of ${snap.rounds}${view.phase === 'paused' ? ' (paused)' : ''}`}
        </p>
        <p role="timer" aria-live="off" aria-label="Time left in this round" className="mt-1 font-mono text-6xl font-bold tabular-nums sm:text-7xl">{clock(view.remainingMs)}</p>
      </div>

      {rv && view.phase !== 'not-started' && view.phase !== 'done' && (
        <section aria-label="Up now" className="mt-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand-grey">Up now</h3>
          <ul className="mt-1 space-y-2">
            {rv.upNow.map((g) => (
              <li key={g.net} className="rounded-lg bg-white p-3 ring-1 ring-brand-black/10">
                <span className="font-bold text-brand-black">Net {g.net}</span>
                <span className="text-brand-charcoal">: {names(g.players)}</span>
              </li>
            ))}
          </ul>
          {rv.upNext.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-brand-grey">Up next</h3>
              <ul className="mt-1 space-y-1 text-brand-charcoal">
                {rv.upNext.map((g) => (
                  <li key={g.net}><span className="font-semibold">Net {g.net}</span>: {names(g.players)}</li>
                ))}
              </ul>
            </>
          )}
          {rv.waiting.length > 0 && <p className="mt-3 text-sm text-brand-grey"><span className="font-semibold">Waiting:</span> {names(rv.waiting)}</p>}
        </section>
      )}

      {view.phase === 'not-started' && (
        <ul className="mt-4 space-y-1 text-brand-charcoal">
          {plan.groups.map((g) => (
            <li key={g.number}><span className="font-semibold">Round {g.round + 1}, net {g.net}</span>: {names(g.players)}</li>
          ))}
        </ul>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        {snap.state === 'planned' && (
          <>
            {canBuild && <button type="button" className={btnQuiet} disabled={busy} onClick={() => run(actions.build)}>Build again</button>}
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => run(actions.start)}>Start</button>
          </>
        )}
        {snap.state === 'running' && <button type="button" className={btnQuiet} disabled={busy} onClick={() => run(actions.pause)}>Pause</button>}
        {snap.state === 'paused' && <button type="button" className={btnPrimary} disabled={busy} onClick={() => run(actions.resume)}>Resume</button>}
        {(snap.state === 'running' || snap.state === 'paused') && view.nextRound != null && <button type="button" className={btnPrimary} disabled={busy} onClick={() => run(actions.next)}>Next round</button>}
        {snap.state !== 'planned' && snap.state !== 'finished' && <div className="col-span-2"><ConfirmButton label="Finish" confirmLabel="Really finish?" className={btnQuiet} disabled={busy} onConfirm={() => run(actions.finish)} /></div>}
      </div>
      {snap.state === 'finished' && <p className="mt-3 text-sm text-brand-grey">This session is finished.</p>}
      {message && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{message}</p>}
    </div>
  )
}
