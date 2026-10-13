import type { BatStatus } from '@/lib/stats/match/types'

/**
 * Rolling figures (wave E, WP-3, spec 5.2). Pure functions on plain rows, in time order.
 *
 * Batting: the window is the last `window` innings whose status is known (out or not out; an innings of unknown status is
 * neither, so it never enters a window). The average is runs over dismissals and is drawn only when the window holds at least
 * `minOuts` dismissals: a window of not-outs has no honest average, so the point is a gap, never 0 and never infinite.
 * Bowling: the window is the last `window` spells with balls bowled; economy is drawn from `minSpells` spells.
 */
export type BatInn = { runs: number; status: BatStatus }
export type Spell = { balls: number; runs: number }

export function rollingBattingAverage(inns: readonly BatInn[], window: number, minOuts: number): (number | null)[] {
  const known: BatInn[] = []
  return inns.map((i) => {
    if (i.status !== 'unknown') known.push(i)
    const w = known.slice(-window)
    const outs = w.filter((x) => x.status === 'out').length
    if (outs < Math.max(1, minOuts)) return null
    return w.reduce((s, x) => s + x.runs, 0) / outs
  })
}

export function rollingEconomy(spells: readonly Spell[], window: number, minSpells: number): (number | null)[] {
  const bowled: Spell[] = []
  return spells.map((s) => {
    if (s.balls > 0) bowled.push(s)
    const w = bowled.slice(-window)
    if (w.length < Math.max(1, minSpells)) return null
    const balls = w.reduce((a, x) => a + x.balls, 0)
    return balls > 0 ? w.reduce((a, x) => a + x.runs, 0) / (balls / 6) : null
  })
}
