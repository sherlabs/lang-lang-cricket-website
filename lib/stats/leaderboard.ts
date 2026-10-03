import type { SeasonCounts } from '@/lib/players/season-math'
import { careerOf, mergeBySeason, type StatRow } from './aggregate'
import { classifyGrade, GRADE_CATEGORIES, type GradeCategory, type GradeRule } from './categories'
import { getMetric } from './metrics'
import type { QualConfig } from './qualify'
import { rankBy, type RankResult } from './rank'
import { ALL, type StatsParams } from './query-string'

/**
 * Pure assembly of the leaderboard and records inputs from visible rows + settings, so pages
 * stay thin and the data rules (filter before merge, classify by grade, scope) are unit-tested.
 */
export type ViewSettings = { defaultIncludedCategories: readonly GradeCategory[]; gradeRules: readonly GradeRule[]; qualification: QualConfig }

export const categoryOf = (r: Pick<StatRow, 'gradeName' | 'teamName'>, rules: readonly GradeRule[]): GradeCategory =>
  classifyGrade(r.gradeName, r.teamName, rules)

/** Categories that hold at least one row; categories with none are not offered in the UI. */
export function availableCategories(rows: readonly StatRow[], rules: readonly GradeRule[]): GradeCategory[] {
  const seen = new Set(rows.map((r) => categoryOf(r, rules)))
  return GRADE_CATEGORIES.filter((c) => seen.has(c))
}

/** Rows in the chosen categories, optionally one season and one grade (before any merge). */
export function filterRows(
  rows: readonly StatRow[],
  o: { cats: readonly GradeCategory[]; rules: readonly GradeRule[]; season?: string; grade?: string },
): StatRow[] {
  return rows.filter(
    (r) =>
      o.cats.includes(categoryOf(r, o.rules)) &&
      (!o.season || o.season === ALL || r.seasonName === o.season) &&
      (!o.grade || o.grade === ALL || r.gradeName === o.grade),
  )
}

/** Grade names present in the given rows, sorted. */
export const gradeNames = (rows: readonly StatRow[]): string[] =>
  [...new Set(rows.map((r) => r.gradeName).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b))

export type BoardItem = { playerId: number; counts: SeasonCounts }
export type Leaderboard = { scope: 'career' | 'season'; metricKey: string; result: RankResult<BoardItem> }

export function buildLeaderboard(
  rows: readonly StatRow[],
  params: Pick<StatsParams, 'season' | 'grade' | 'metric'>,
  cats: readonly GradeCategory[],
  settings: ViewSettings,
): Leaderboard {
  const scope = params.season === ALL ? 'career' : 'season'
  const filtered = filterRows(rows, { cats, rules: settings.gradeRules, season: params.season, grade: params.grade })
  const items: BoardItem[] = (scope === 'career' ? careerOf(filtered) : mergeBySeason(filtered)).map((x) => ({ playerId: x.playerId, counts: x.counts }))
  const metric = getMetric(params.metric)!
  return { scope, metricKey: metric.key, result: rankBy(items, metric, settings.qualification[scope]) }
}
