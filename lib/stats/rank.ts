import type { SeasonCounts } from '@/lib/players/season-math'
import type { Metric } from './metrics'
import { qualifies, type QualScope } from './qualify'

export type Ranked<T> = { rank: number; item: T; value: number; display: string }

/** Competition ranking ("1224"): ties share a rank, the next rank skips. */
export function rankValues<T>(items: readonly T[], valueOf: (t: T) => number | null, higherIsBetter: boolean): { rank: number; item: T; value: number }[] {
  const scored = items
    .map((item) => ({ item, value: valueOf(item) }))
    .filter((x): x is { item: T; value: number } => x.value !== null && Number.isFinite(x.value))
  scored.sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value))
  let rank = 0
  return scored.map((s, i) => {
    if (i === 0 || s.value !== scored[i - 1].value) rank = i + 1
    return { rank, item: s.item, value: s.value }
  })
}

export type RankResult<T> = {
  ranked: Ranked<T>[]
  /** Have a value but fail the qualification minimum: listed, never ranked. */
  unqualified: T[]
}

/**
 * Rank items by a metric. Counting metrics skip zero values (a player with 0 sixes is not on
 * the sixes board); others need the scope's minimum, else the row goes to `unqualified`.
 */
export function rankBy<T extends { counts: SeasonCounts }>(items: readonly T[], metric: Metric, scope: QualScope, opts: { limit?: number } = {}): RankResult<T> {
  const eligible: T[] = []
  const unqualified: T[] = []
  for (const it of items) {
    const v = metric.value(it.counts)
    if (v === null || !Number.isFinite(v)) continue
    if (metric.qualifier === 'count') {
      // `hs` carries a +0.5 not-out tie-break, so gate on the real score: a "0*" is not a high score.
      const real = metric.key === 'hs' ? it.counts.batHighScore : v
      if (real > 0) eligible.push(it)
    } else if (qualifies(metric.qualifier, it.counts, scope)) eligible.push(it)
    else unqualified.push(it)
  }
  const ranked = rankValues(eligible, (t) => metric.value(t.counts), metric.higherIsBetter).map((r) => ({ ...r, display: metric.format(r.item.counts) }))
  return { ranked: opts.limit ? ranked.slice(0, opts.limit) : ranked, unqualified }
}

export type Badge = 'gold' | 'silver' | 'bronze'
/** Position badge: 1 gold, 2 silver, 3 bronze. Ties share the badge of the shared rank. */
export function badgeFor(rank: number): Badge | null {
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null
}

export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
