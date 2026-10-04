import { GRADE_CATEGORIES, parseCategories, type GradeCategory } from './categories'
import { GROUPS, LEADERBOARD_METRIC_KEYS, getMetric, leaderboardMetrics, type MetricGroup } from './metrics'
import { MATCH_LEADERBOARD_KEYS, getMatchMetric, matchLeaderboardMetrics } from './match/metrics'

/** Every metric key the leaderboard page accepts: the season-total ones, then the match-data ones. */
export const BOARD_METRIC_KEYS: readonly string[] = [...LEADERBOARD_METRIC_KEYS, ...MATCH_LEADERBOARD_KEYS]
export const isMatchBoardKey = (key: string): boolean => MATCH_LEADERBOARD_KEYS.includes(key)

/** Metrics offered for a group, in page order: season totals first, match data after. */
export const boardMetricsFor = (group: MetricGroup): { key: string; label: string; source: 'season' | 'match' }[] => [
  ...leaderboardMetrics(group).map((m) => ({ key: m.key, label: m.label, source: 'season' as const })),
  ...matchLeaderboardMetrics(group).map((m) => ({ key: m.key, label: m.label, source: 'match' as const })),
]

type Raw = Record<string, string | string[] | undefined>

/** First value of a query key (a repeated key such as `?a=1&a=2` arrives as an array). */
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/** `?cat=a,b` or repeated `?cat=a&cat=b` (checkbox group) as one comma list. */
export const catParam = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v.join(',') : v)

export const MAX_PARAM_LENGTH = 80
const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim()
  return t && t.length <= MAX_PARAM_LENGTH ? t : undefined
}

export const ALL = 'all'

export type StatsParams = {
  /** `all` = the whole stored window, else a known season name. */
  season: string
  /** `all`, or a known grade name. */
  grade: string
  /** Explicit categories from `?cat=` / `?juniors=1`; null = use the site default. */
  cats: GradeCategory[] | null
  juniors: boolean
  metric: string
  /** True when `?metric=` named a valid metric (full list view); false shows the group hub. */
  metricGiven: boolean
  group: MetricGroup
}

export type StatsKnown = { seasons: readonly string[]; grades: readonly string[] }

export const DEFAULT_METRIC = 'runs'

/** Parse leaderboard params. Anything unknown or malformed falls back to the default; never throws. */
export function parseStatsParams(raw: Raw, known: StatsKnown): StatsParams {
  const seasonIn = clean(first(raw.season))
  const gradeIn = clean(first(raw.grade))
  const metricIn = clean(first(raw.metric))
  const groupIn = clean(first(raw.group))
  const groupOk = (GROUPS as readonly string[]).includes(groupIn ?? '') ? (groupIn as MetricGroup) : null
  // A valid metric decides the group; otherwise a valid group picks its first metric.
  const metric =
    metricIn && BOARD_METRIC_KEYS.includes(metricIn)
      ? metricIn
      : groupOk
        ? (boardMetricsFor(groupOk)[0]?.key ?? DEFAULT_METRIC)
        : DEFAULT_METRIC
  const cats = parseCategories(clean(catParam(raw.cat)))
  const juniors = first(raw.juniors) === '1'
  return {
    season: seasonIn && known.seasons.includes(seasonIn) ? seasonIn : ALL,
    grade: gradeIn && known.grades.includes(gradeIn) ? gradeIn : ALL,
    cats: cats.length ? cats : null,
    juniors,
    metric,
    metricGiven: !!metricIn && BOARD_METRIC_KEYS.includes(metricIn),
    group: (getMetric(metric) ?? getMatchMetric(metric)!).group,
  }
}

/** Categories that apply: explicit `?cat=` wins, else the site default; `?juniors=1` adds junior. */
export function effectiveCategories(p: Pick<StatsParams, 'cats' | 'juniors'>, defaults: readonly GradeCategory[]): GradeCategory[] {
  const base = p.cats ?? defaults
  const out = new Set<GradeCategory>(base)
  if (p.juniors) out.add('junior')
  return GRADE_CATEGORIES.filter((c) => out.has(c))
}

/** Canonical (sorted key order) href that omits defaults, so equal views share one URL. */
export function statsHref(base: string, p: Partial<StatsParams> & { page?: number }): string {
  const q = new URLSearchParams()
  const set = (k: string, v: string | undefined, def?: string) => { if (v && v !== def) q.set(k, v) }
  set('cat', p.cats?.length ? p.cats.join(',') : undefined)
  set('grade', p.grade, ALL)
  if (p.juniors) q.set('juniors', '1')
  set('metric', p.metric, DEFAULT_METRIC)
  set('season', p.season, ALL)
  const s = [...q].sort(([a], [b]) => a.localeCompare(b))
  const qs = new URLSearchParams(s).toString()
  return qs ? `${base}?${qs}` : base
}
