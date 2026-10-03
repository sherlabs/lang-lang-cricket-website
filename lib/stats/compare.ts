import type { SeasonCounts } from '@/lib/players/season-math'
import type { SeasonRow } from './aggregate'
import { getMetric } from './metrics'
import { qualifies, type QualScope } from './qualify'
import { shortSeason } from './season-window'

/** Metrics shown in the head-to-head table, in order. All come from the one metric registry. */
export const COMPARE_METRICS = ['games', 'runs', 'avg', 'hs', 'sr', 'fours', 'sixes', 'wickets', 'bowlAvg', 'econ', 'best', 'catches'] as const

export type CompareRow = { key: string; label: string; group: string; a: string; b: string; better: 'a' | 'b' | null }

/**
 * Head-to-head rows. The better value is highlighted only when both players have a value, the
 * values differ and, for rate metrics, both meet the qualification minimum (a 40-run average
 * is not a fair comparison). Ties highlight neither.
 */
export function compareCounts(a: SeasonCounts, b: SeasonCounts, qual: QualScope): CompareRow[] {
  return COMPARE_METRICS.map((key) => {
    const m = getMetric(key)!
    const va = m.value(a), vb = m.value(b)
    const fair = m.qualifier === 'count' || (qualifies(m.qualifier, a, qual) && qualifies(m.qualifier, b, qual))
    let better: CompareRow['better'] = null
    if (fair && va !== null && vb !== null && va !== vb && (m.qualifier !== 'count' || va > 0 || vb > 0)) {
      better = (va > vb) === m.higherIsBetter ? 'a' : 'b'
    }
    return { key, label: m.label, group: m.group, a: m.format(a), b: m.format(b), better }
  })
}

export function commonSeasonNames(a: readonly SeasonRow[], b: readonly SeasonRow[]): string[] {
  const names = new Set(b.map((s) => s.seasonName))
  return a.filter((s) => names.has(s.seasonName)).map((s) => s.seasonName)
}

export type SeasonSplitRow = { seasonName: string; label: string; a: SeasonCounts | null; b: SeasonCounts | null }

/** One row per season on a shared axis (oldest first); a player without that season has null. */
export function seasonSplit(a: readonly SeasonRow[], b: readonly SeasonRow[], only?: readonly string[]): SeasonSplitRow[] {
  const order = new Map<string, number>()
  for (const s of [...a, ...b]) order.set(s.seasonName, Math.min(order.get(s.seasonName) ?? Infinity, s.seasonOrder))
  const A = new Map(a.map((s) => [s.seasonName, s.counts])), B = new Map(b.map((s) => [s.seasonName, s.counts]))
  return [...order]
    .filter(([name]) => !only || only.includes(name))
    .sort((x, y) => y[1] - x[1])
    .map(([seasonName]) => ({ seasonName, label: shortSeason(seasonName), a: A.get(seasonName) ?? null, b: B.get(seasonName) ?? null }))
}
