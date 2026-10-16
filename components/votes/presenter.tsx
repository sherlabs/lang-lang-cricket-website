'use client'

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { buildRevealSteps, type PresentRow, type PresentSnapshot, type RevealStep } from '@/lib/votes/present'
import { movementText } from '@/lib/votes/tally'

const btn = 'inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl px-6 text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40'

function Rows({ rows, big }: { rows: readonly PresentRow[]; big?: boolean }) {
  return (
    <ol className={`mx-auto w-full max-w-3xl space-y-2 ${big ? 'text-[clamp(1.5rem,4vw,3rem)]' : 'text-[clamp(1.1rem,2.6vw,2rem)]'}`}>
      {rows.map((r) => (
        <li key={r.playerId} className="flex items-baseline justify-between gap-4 rounded-xl bg-white/10 px-4 py-2">
          <span className="font-semibold"><span className="mr-3 tabular-nums">{r.rank}{r.shared ? '=' : ''}</span>{r.name}</span>
          <span className="whitespace-nowrap tabular-nums">{r.points} pts{r.movement && r.movement.kind !== 'same' ? <span className="ml-3 text-[0.6em] opacity-80">{movementText(r.movement)}</span> : null}</span>
        </li>
      ))}
    </ol>
  )
}

function StepView({ step }: { step: RevealStep }) {
  switch (step.kind) {
    case 'title':
      return (
        <div className="text-center">
          <h1 className="display text-[clamp(2.5rem,8vw,6rem)] leading-tight">{step.heading}</h1>
          <p className="mt-4 text-[clamp(1.1rem,3vw,2rem)] opacity-90">{step.sub}</p>
        </div>
      )
    case 'round':
      return (
        <div className="w-full">
          <h2 className="display mb-6 text-center text-[clamp(1.75rem,5vw,3.5rem)]">{step.heading}</h2>
          <Rows rows={step.rows} />
        </div>
      )
    case 'countdown':
      return (
        <div className="text-center">
          <p className="display text-[clamp(2rem,6vw,4.5rem)] opacity-90">{step.heading}</p>
          <p className="display mt-4 text-[clamp(2.5rem,9vw,7rem)] leading-tight">{step.row.name}</p>
          <p className="mt-2 text-[clamp(1.5rem,4vw,3rem)] tabular-nums">{step.row.points} points</p>
        </div>
      )
    default:
      return (
        <div className="text-center">
          <p className="display text-[clamp(2rem,6vw,4.5rem)] opacity-90">{step.heading}</p>
          {step.rows.map((r) => (
            <div key={r.playerId} className="mt-4">
              <p className="display text-[clamp(3rem,11vw,9rem)] leading-tight">{r.name}</p>
              <p className="text-[clamp(1.5rem,4vw,3rem)] tabular-nums">{r.points} points</p>
            </div>
          ))}
        </div>
      )
  }
}

// The current step lives in sessionStorage (with an in-memory fallback when storage is blocked) and is read through
// useSyncExternalStore, so the server render and the first client render agree (step 0) and a reload then resumes.
const memory = new Map<string, number>()
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
function readStep(key: string): number {
  try {
    const v = sessionStorage.getItem(key)
    if (v != null && /^\d{1,4}$/.test(v)) return Number(v)
  } catch {
    // private window or blocked storage
  }
  return memory.get(key) ?? 0
}
function writeStep(key: string, n: number) {
  memory.set(key, n)
  try {
    sessionStorage.setItem(key, String(n))
  } catch {
    // the reveal still works; it just starts again after a reload
  }
  listeners.forEach((l) => l())
}
const noopSubscribe = () => () => {}
const subscribeFullscreen = (cb: () => void) => {
  document.addEventListener('fullscreenchange', cb)
  return () => document.removeEventListener('fullscreenchange', cb)
}

/**
 * Awards-night reveal. Everything it can show is in `snapshot` (cumulative totals of closed rounds, never ballots, never per-game
 * points). Keys: Right or Space for next, Left for back, F for full screen. The step is kept in sessionStorage so a reload resumes.
 */
export function Presenter({ snapshot, storageKey }: { snapshot: PresentSnapshot; storageKey: string }) {
  const steps = useMemo(() => buildRevealSteps(snapshot), [snapshot])
  const root = useRef<HTMLDivElement>(null)
  const last = steps.length - 1
  const saved = useSyncExternalStore(subscribe, () => readStep(storageKey), () => 0)
  const i = Math.min(last, Math.max(0, saved))
  const go = useCallback((n: number) => writeStep(storageKey, Math.min(last, Math.max(0, n))), [last, storageKey])
  const fs = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false)
  const canFullscreen = useSyncExternalStore(noopSubscribe, () => Boolean(document.documentElement.requestFullscreen), () => false)

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen()
    } catch {
      // not allowed here: the button simply does nothing
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        go(i + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(i - 1)
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        void toggleFullscreen()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, i, toggleFullscreen])

  const step = steps[i]
  return (
    <div ref={root} className="flex min-h-dvh flex-col bg-brand-black text-white">
      <div className="sr-only" aria-live="polite" role="status">{step.kind === 'countdown' ? `${step.heading}: ${step.row.name}` : step.heading}</div>
      <main className="flex flex-1 items-center justify-center px-4 py-8 motion-safe:transition-opacity">
        {steps.length === 1 ? <p className="text-center text-xl">Nothing to show yet. Rounds appear here once their voting has closed.</p> : <StepView key={i} step={step} />}
      </main>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/20 px-4 py-3">
        <p className="text-sm opacity-80">Step {i + 1} of {steps.length}</p>
        <div className="flex gap-3">
          <button type="button" className={`${btn} border border-white/40`} onClick={() => go(i - 1)} disabled={i === 0}>Back</button>
          <button type="button" className={`${btn} bg-brand-gold text-brand-black`} onClick={() => go(i + 1)} disabled={i === last}>Next</button>
          {canFullscreen && <button type="button" className={`${btn} border border-white/40`} onClick={() => void toggleFullscreen()} aria-pressed={fs}>{fs ? 'Exit full screen' : 'Full screen'}</button>}
        </div>
      </div>
    </div>
  )
}
