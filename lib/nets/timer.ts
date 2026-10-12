import type { NetState } from './constants'

/**
 * The rotation timer, derived from stored timestamps (wave B spec 4.3). Nothing is written when a round rolls: the effective round
 * is `round + floor(elapsed / turn)`, clamped to the last round, so a reload, a second phone or a throttled background tab all
 * agree once they look again. Times are epoch milliseconds.
 */
export type TimerInput = {
  state: NetState
  round: number
  roundStartedAt: number | null
  pausedAt: number | null
  minutes: number
  rounds: number
}
export type TimerView = {
  phase: 'not-started' | 'running' | 'paused' | 'done'
  /** The round now up (0-based); -1 before the start. */
  round: number
  remainingMs: number
  /** The round after this one, or null on the last. */
  nextRound: number | null
}

export function timerView(t: TimerInput, now: number): TimerView {
  const turn = Math.max(1, t.minutes) * 60_000
  const last = t.rounds - 1
  if (t.state === 'finished') return { phase: 'done', round: Math.max(-1, Math.min(t.round, last)), remainingMs: 0, nextRound: null }
  if (t.state === 'planned' || t.roundStartedAt == null || t.rounds <= 0) return { phase: 'not-started', round: -1, remainingMs: turn, nextRound: t.rounds > 0 ? 0 : null }
  const at = t.state === 'paused' && t.pausedAt != null ? t.pausedAt : now
  const elapsed = Math.max(0, at - t.roundStartedAt)
  const raw = t.round + Math.floor(elapsed / turn)
  if (raw > last) return { phase: 'done', round: last, remainingMs: 0, nextRound: null }
  return { phase: t.state === 'paused' ? 'paused' : 'running', round: raw, remainingMs: turn - (elapsed % turn), nextRound: raw < last ? raw + 1 : null }
}

/** `m:ss` for a countdown (rounded up, so the last second shows 0:01 rather than 0:00 while it is still running). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** What each action writes. `now` is the server's clock; the caller bumps `revision`. */
export type TimerWrite = { state: NetState; round: number; roundStartedAt: number | null; pausedAt: number | null }

export const startWrite = (now: number): TimerWrite => ({ state: 'running', round: 0, roundStartedAt: now, pausedAt: null })
export const pauseWrite = (t: TimerInput, now: number): TimerWrite => ({ state: 'paused', round: t.round, roundStartedAt: t.roundStartedAt, pausedAt: now })
/** Resume moves the start forward by the time spent paused. */
export const resumeWrite = (t: TimerInput, now: number): TimerWrite => ({
  state: 'running',
  round: t.round,
  roundStartedAt: t.roundStartedAt == null ? now : t.roundStartedAt + Math.max(0, now - (t.pausedAt ?? now)),
  pausedAt: null,
})
/** Next round: the effective round plus one, starting now (or full length and still paused when paused). Null past the last round. */
export function nextRoundWrite(t: TimerInput, now: number): TimerWrite | null {
  const v = timerView(t, now)
  if (v.phase === 'not-started' || v.phase === 'done' || v.nextRound == null) return null
  if (t.state === 'paused') return { state: 'paused', round: v.nextRound, roundStartedAt: t.pausedAt ?? now, pausedAt: t.pausedAt ?? now }
  return { state: 'running', round: v.nextRound, roundStartedAt: now, pausedAt: null }
}
