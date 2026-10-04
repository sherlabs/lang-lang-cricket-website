import { classifyGrade, type GradeCategory, type GradeRule } from '../categories'
import { sameLabel } from '../labels'
import { filterFacts } from './facts'
import type { FactSet, MatchHeader } from './types'

/** Which stored matches a view keeps (W2 spec 5.1): grade category, season, grade, opposition, format. */
export type MatchFilter = {
  cats?: readonly GradeCategory[]
  rules?: readonly GradeRule[]
  /** A season name, or undefined for every season. */
  season?: string
  /** A grade label (compared after normalisation), or undefined for every grade. */
  grade?: string
  oppKey?: string
  format?: string
}

/** The pure predicate behind `filterMatchFacts`, exported for tests. */
export function matchKeeper(f: MatchFilter): (h: MatchHeader) => boolean {
  return (h) =>
    (!f.cats || f.cats.includes(classifyGrade(h.grade, h.team, f.rules ?? []))) &&
    (!f.season || h.seasonName === f.season) &&
    (!f.grade || sameLabel(h.grade, f.grade)) &&
    (!f.oppKey || h.oppKey === f.oppKey) &&
    (!f.format || h.format === f.format)
}

export function filterMatchFacts(set: FactSet, f: MatchFilter): FactSet {
  const out = filterFacts(set, matchKeeper(f))
  // A single season is never cut by the season cap, so the note only applies to a request across seasons.
  if (f.season) delete out.seasonCap
  return out
}

