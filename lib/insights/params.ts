import { ALL, first } from '@/lib/stats/query-string'
import { resolveGradeParam } from '@/lib/stats/labels'

/**
 * Query parameters of the Insights pages (wave E, WP-3). Anything unknown or malformed falls back to "all" (or the
 * default); it never throws and never echoes the raw value.
 */
type Raw = Record<string, string | string[] | undefined>
const MAX = 80

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim()
  return t && t.length <= MAX ? t : undefined
}

export type InsightsParams = { season: string; grade: string }

export function parseInsightsParams(raw: Raw, known: { seasons: readonly string[]; grades: readonly string[]; canonicalGrade?: (g: string) => string }): InsightsParams {
  const season = clean(first(raw.season))
  const grade = clean(first(raw.grade))
  return {
    season: season && known.seasons.includes(season) ? season : ALL,
    grade: resolveGradeParam(grade, known.grades, known.canonicalGrade) ?? ALL,
  }
}

/** `?season=` / `?vs=` of a player's trends page: a season the player has, else the default. */
export function pickSeason(input: string | string[] | undefined, seasons: readonly string[], fallback: string | null): string | null {
  const v = clean(first(input))
  return v && seasons.includes(v) ? v : fallback
}

export function insightsHref(base: string, p: Partial<InsightsParams>): string {
  const q = new URLSearchParams()
  if (p.grade && p.grade !== ALL) q.set('grade', p.grade)
  if (p.season && p.season !== ALL) q.set('season', p.season)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}
