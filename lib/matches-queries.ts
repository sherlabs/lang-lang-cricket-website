import { getClubGames, getSeasonGroups, resolveSeason } from '@/lib/playhq'
import { isFinished } from '@/lib/playhq/games'
import type { Game, SeasonGroup } from '@/lib/playhq/types'

/**
 * Match archive (spec A10). Pure filtering, grouping and paging over the club's PlayHQ games, plus
 * one loader that reuses `getClubGames` (five teams at a time, TTL cached), so the page costs
 * no extra PlayHQ calls over the fixtures page.
 */
type Raw = Record<string, string | string[] | undefined>

export const RESULT_FILTERS = ['all', 'won', 'lost', 'other'] as const
export type ResultFilter = (typeof RESULT_FILTERS)[number]
export const ROUNDS_PER_PAGE = 6
/** Above this many finished games, with no grade chosen, only the first page of rounds is shown. */
export const NARROW_THRESHOLD = 200
export const NO_ROUND = 'Round to be confirmed'

export type MatchFilters = { grade: string | null; q: string; result: ResultFilter; page: number }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? ''

/** Parse `?grade&q&result&page`. Unknown values fall back to the default; never throws. */
export function parseMatchParams(raw: Raw, knownGrades: readonly string[]): MatchFilters {
  const grade = one(raw.grade)
  const q = one(raw.q)
  const result = one(raw.result)
  const page = Number(one(raw.page))
  return {
    grade: grade && knownGrades.includes(grade) ? grade : null,
    q: q.length <= 80 ? q : '',
    result: (RESULT_FILTERS as readonly string[]).includes(result) ? (result as ResultFilter) : 'all',
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  }
}

/** won / lost from the club side's outcome; everything else finished (draw, tie, abandoned, no result) is `other`. */
export function resultOf(g: Game): Exclude<ResultFilter, 'all'> {
  const o = g.club.outcome ?? ''
  if (g.status !== 'ABANDONED' && o.startsWith('WON')) return 'won'
  if (g.status !== 'ABANDONED' && o.startsWith('LOST')) return 'lost'
  return 'other'
}

/** Grade names that have at least one finished game, sorted. */
export const matchGrades = (games: readonly Game[]): string[] =>
  [...new Set(games.filter(isFinished).map((g) => g.gradeName).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

export function filterGames(games: readonly Game[], f: Pick<MatchFilters, 'grade' | 'q' | 'result'>): Game[] {
  const q = f.q.toLowerCase()
  return games.filter(
    (g) =>
      isFinished(g) &&
      (!f.grade || g.gradeName === f.grade) &&
      (!q || g.opponent.name.toLowerCase().includes(q)) &&
      (f.result === 'all' || resultOf(g) === f.result),
  )
}

export type RoundGroup = { key: string; label: string; games: Game[] }

/** Rounds newest first (by the latest game in each), games within a round newest first. */
export function groupByRound(games: readonly Game[]): RoundGroup[] {
  const by = new Map<string, Game[]>()
  for (const g of games) {
    const key = g.roundName ?? NO_ROUND
    by.set(key, [...(by.get(key) ?? []), g])
  }
  const newest = (gs: Game[]) => gs.reduce((m, g) => (g.sortKey > m ? g.sortKey : m), '')
  return [...by]
    .map(([key, gs]) => ({ key, label: key, games: [...gs].sort((a, b) => b.sortKey.localeCompare(a.sortKey) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => newest(b.games).localeCompare(newest(a.games)) || a.label.localeCompare(b.label))
}

export type MatchView = {
  rounds: RoundGroup[]
  page: number
  pages: number
  /** Finished games after filtering (before paging). */
  total: number
  /** True when the page was cut to the first page of rounds because the season is large and no grade was chosen. */
  narrowed: boolean
}

export function buildMatchView(games: readonly Game[], f: MatchFilters): MatchView {
  const filtered = filterGames(games, f)
  const groups = groupByRound(filtered)
  const pages = Math.max(1, Math.ceil(groups.length / ROUNDS_PER_PAGE))
  const narrowed = !f.grade && filtered.length > NARROW_THRESHOLD
  const page = narrowed ? 1 : Math.min(f.page, pages)
  const start = (page - 1) * ROUNDS_PER_PAGE
  return { rounds: groups.slice(start, start + ROUNDS_PER_PAGE), page, pages: narrowed ? 1 : pages, total: filtered.length, narrowed }
}

export type LoadedSeason = { groups: SeasonGroup[]; season: SeasonGroup; games: Game[] }

/** Season groups plus the club's games for the requested (or default) season. Throws when PlayHQ is unreachable. */
export async function loadSeasonGames(seasonParam: string | undefined): Promise<LoadedSeason> {
  const { groups, season } = await resolveSeason(seasonParam)
  if (!season) throw new Error('no seasons')
  const { games } = await getClubGames(season)
  return { groups, season, games }
}

export type SeasonResults = { status: 'ok'; games: Game[] } | { status: 'none' } | { status: 'unavailable' }

/**
 * The club's games for a named season group, for the yearbook results block. `none` = PlayHQ does
 * not list that season (older than its coverage); `unavailable` = PlayHQ could not be reached.
 */
export async function loadGamesForSeasonName(seasonName: string): Promise<SeasonResults> {
  try {
    const group = (await getSeasonGroups()).find((g) => g.name === seasonName)
    if (!group) return { status: 'none' }
    return { status: 'ok', games: (await getClubGames(group)).games }
  } catch (err) {
    console.error('[playhq] season results', seasonName, err instanceof Error ? err.message : err)
    return { status: 'unavailable' }
  }
}
