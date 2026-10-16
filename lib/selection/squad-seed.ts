import { normaliseLabel } from '@/lib/stats/labels'
import { rowSeasonYear } from './season'

/**
 * Squad helpers (announce-teams spec 4.8), pure: which players played when, the recency filters of the Add players sheet and the
 * "Start from last season" preview.
 */
export type SeasonRow = { playerId: number; gradeName?: string | null; games?: number | null; seasonStartYear?: number | null; seasonName?: string | null }

export type Recency = 'this-season' | 'last-season' | 'recent' | 'never'
export const RECENCY_LABEL: Record<Recency, string> = { 'this-season': 'Played this season', 'last-season': 'Played last season', recent: 'Played in the last few years', never: 'Never played' }

/** Per player: the start years in which they played at least one game. */
export function playedYears(rows: readonly SeasonRow[]): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>()
  for (const r of rows) {
    const year = rowSeasonYear(r)
    if (year == null || !(r.games && r.games > 0)) continue
    const set = out.get(r.playerId) ?? new Set<number>()
    set.add(year)
    out.set(r.playerId, set)
  }
  return out
}

/** The recency tag of a player: the most recent bucket they fall in. */
export function recencyOf(years: ReadonlySet<number> | undefined, currentYear: number, recentYears = 3): Recency {
  if (!years || years.size === 0) return 'never'
  if (years.has(currentYear)) return 'this-season'
  if (years.has(currentYear - 1)) return 'last-season'
  for (const y of years) if (y >= currentYear - recentYears && y < currentYear) return 'recent'
  return 'never'
}

/** Does a player with this recency show under the chosen filter? `recent` includes this and last season. */
export function matchesRecency(recency: Recency, filter: Recency | 'all'): boolean {
  if (filter === 'all') return true
  if (filter === 'recent') return recency !== 'never'
  return recency === filter
}

/** The season the auto-seed copies from: the newest start year before the current one that has games. */
export function lastSeasonYear(rows: readonly SeasonRow[], currentYear: number): number | null {
  let best: number | null = null
  for (const r of rows) {
    const y = rowSeasonYear(r)
    if (y != null && y < currentYear && r.games && r.games > 0 && (best == null || y > best)) best = y
  }
  return best
}

export type SeedGrade = { gradeKey: string; playerIds: number[] }

/**
 * Last season's players, grouped by grade name. `canonical` maps a stored grade name to the label the site shows (the admin
 * renames of "Grade and team names"), so a renamed grade still matches this season's fixtures; the key is then normalised.
 */
export function seedFromLastSeason(rows: readonly SeasonRow[], year: number, canonical: (g: string) => string = (g) => g): SeedGrade[] {
  const groups = new Map<string, Set<number>>()
  for (const r of rows) {
    if (rowSeasonYear(r) !== year || !(r.games && r.games > 0) || !r.gradeName) continue
    const key = normaliseLabel(canonical(r.gradeName))
    if (!key) continue
    const set = groups.get(key) ?? new Set<number>()
    set.add(r.playerId)
    groups.set(key, set)
  }
  return [...groups].map(([gradeKey, ids]) => ({ gradeKey, playerIds: [...ids] })).sort((a, b) => a.gradeKey.localeCompare(b.gradeKey))
}

/** The key two grade names share when they are the same grade (used to match squads to fixtures and last season's rows). */
export const gradeKeyOf = (name: string | null | undefined, canonical: (g: string) => string = (g) => g): string => normaliseLabel(name ? canonical(name) : '')
