import type { SeasonRow } from './aggregate'
import { getMetric } from './metrics'
import { qualifies, type QualScope } from './qualify'
import { shortSeason } from './season-window'

/**
 * Per-season series for a player's profile charts (spec A4). Built from rows already merged by
 * (player, season), oldest season first. A series needs at least two seasons with a value to be
 * drawn: one point is not a progression.
 */
export type SeriesKey = 'runs' | 'avg' | 'wickets' | 'games'
export type SeriesPoint = { seasonName: string; label: string; value: number | null; text: string }
export type Series = { key: SeriesKey; label: string; kind: 'bar' | 'line'; points: SeriesPoint[] }

const oldestFirst = (seasons: readonly SeasonRow[]) => [...seasons].sort((a, b) => b.seasonOrder - a.seasonOrder)

const SERIES: { key: SeriesKey; label: string; kind: Series['kind']; metric: string; eligible: (s: SeasonRow) => boolean }[] = [
  { key: 'runs', label: 'Runs per season', kind: 'bar', metric: 'runs', eligible: (s) => s.counts.batInnings > 0 },
  { key: 'avg', label: 'Batting average per season', kind: 'line', metric: 'avg', eligible: (s) => s.counts.batInnings > 0 },
  { key: 'wickets', label: 'Wickets per season', kind: 'bar', metric: 'wickets', eligible: (s) => s.counts.bowlBalls > 0 },
  { key: 'games', label: 'Games per season', kind: 'bar', metric: 'games', eligible: (s) => s.counts.games > 0 },
]

export function progressionSeries(seasons: readonly SeasonRow[]): Series[] {
  const ordered = oldestFirst(seasons)
  const out: Series[] = []
  for (const def of SERIES) {
    const metric = getMetric(def.metric)!
    const points: SeriesPoint[] = ordered
      .filter(def.eligible)
      .map((s) => ({ seasonName: s.seasonName, label: shortSeason(s.seasonName), value: metric.value(s.counts), text: metric.format(s.counts) }))
    if (points.filter((p) => p.value !== null).length >= 2) out.push({ key: def.key, label: def.label, kind: def.kind, points })
  }
  return out
}

export const hasBatting = (seasons: readonly SeasonRow[]) => seasons.some((s) => s.counts.batInnings > 0)
export const hasBowling = (seasons: readonly SeasonRow[]) => seasons.some((s) => s.counts.bowlBalls > 0)

export type BestWorst = { best: string[]; worst: string[]; bestText: string; worstText: string }

/** Metrics highlighted on the profile (batting and bowling season tables). */
export const HIGHLIGHT_METRICS = ['runs', 'avg', 'sr', 'wickets', 'bowlAvg', 'econ'] as const

/**
 * Best and worst season per metric. Rate metrics only compare seasons that meet the
 * season-scope qualification minimum, so a 20-run cameo never "wins" the average. Needs two
 * eligible seasons with different values; ties for best (or worst) are all returned.
 */
export function bestWorstSeasons(seasons: readonly SeasonRow[], qual: QualScope, keys: readonly string[] = HIGHLIGHT_METRICS): Record<string, BestWorst> {
  const out: Record<string, BestWorst> = {}
  for (const key of keys) {
    const metric = getMetric(key)
    if (!metric) continue
    const scored = seasons
      .filter((s) => (metric.group === 'bowling' ? s.counts.bowlBalls > 0 : s.counts.batInnings > 0) && qualifies(metric.qualifier, s.counts, qual))
      .map((s) => ({ s, v: metric.value(s.counts) }))
      .filter((x): x is { s: SeasonRow; v: number } => x.v !== null && Number.isFinite(x.v))
    if (scored.length < 2) continue
    const top = metric.higherIsBetter ? Math.max(...scored.map((x) => x.v)) : Math.min(...scored.map((x) => x.v))
    const bottom = metric.higherIsBetter ? Math.min(...scored.map((x) => x.v)) : Math.max(...scored.map((x) => x.v))
    if (top === bottom) continue
    const pick = (v: number) => scored.filter((x) => x.v === v)
    out[key] = {
      best: pick(top).map((x) => x.s.seasonName),
      worst: pick(bottom).map((x) => x.s.seasonName),
      bestText: metric.format(pick(top)[0].s.counts),
      worstText: metric.format(pick(bottom)[0].s.counts),
    }
  }
  return out
}
