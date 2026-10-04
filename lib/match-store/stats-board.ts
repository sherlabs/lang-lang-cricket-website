import 'server-only'
import type { GradeCategory, GradeRule } from '@/lib/stats/categories'
import { countsByPlayer } from '@/lib/stats/match/counts'
import { coverageOf, formatCoverageDate } from '@/lib/stats/match/coverage'
import { filterFacts } from '@/lib/stats/match/facts'
import { matchMilestonesCrossed } from '@/lib/stats/match/milestones'
import type { FactSet } from '@/lib/stats/match/types'
import { filterMatchFacts, getAllFacts, getFactsFor } from './stats-queries'

/**
 * Facts for one leaderboard view: the chosen season (or every stored season, bounded by the season
 * cap), grade and categories. Null when the match data cannot be read, so the page still renders.
 */
export async function getMatchBoardFacts(o: { season: string | null; grade: string | null; cats: readonly GradeCategory[]; rules: readonly GradeRule[] }): Promise<FactSet | null> {
  try {
    const year = o.season ? Number(/\d{4}/.exec(o.season)?.[0]) : NaN
    const all = o.season && Number.isFinite(year) ? await getFactsFor([year]) : await getAllFacts()
    return filterMatchFacts(all, { cats: o.cats, rules: o.rules, season: o.season ?? undefined, grade: o.grade ?? undefined })
  } catch (err) {
    console.warn('[stats] match leaderboards unavailable:', (err as Error).message)
    return null
  }
}

export type MatchMilestoneItem = { playerId: number; label: string }

/**
 * Match-data milestones crossed in the newest stored season (50s, 100s, five-fors). They are "since the
 * first stored match", never merged into the baseline-backed milestones. Empty when nothing was crossed
 * or the match data cannot be read.
 */
export async function getMatchMilestoneItems(o: { cats: readonly GradeCategory[]; rules: readonly GradeRule[] }): Promise<{ since: string | null; items: MatchMilestoneItem[] }> {
  try {
    const all = filterMatchFacts(await getAllFacts(), { cats: o.cats, rules: o.rules })
    const years = [...all.matches.values()].map((h) => h.seasonStartYear).filter((y): y is number => y !== null)
    if (years.length === 0) return { since: null, items: [] }
    const latest = Math.max(...years)
    const before = filterFacts(all, (h) => (h.seasonStartYear ?? 0) < latest)
    const crossed = matchMilestonesCrossed(countsByPlayer(filterFacts(all, (h) => (h.seasonStartYear ?? 0) <= latest)), countsByPlayer(before))
    const since = coverageOf(all).firstDate
    return { since: since ? formatCoverageDate(since) : null, items: crossed.map((c) => ({ playerId: c.playerId, label: c.label })) }
  } catch (err) {
    console.warn('[stats] match milestones unavailable:', (err as Error).message)
    return { since: null, items: [] }
  }
}
