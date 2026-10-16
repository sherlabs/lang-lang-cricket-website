import 'server-only'
import { SCOUTING } from '@/config/site'
import { getPayloadClient } from '@/lib/payload/client'
import { listOpponents, loadScoutingMatches, type OpponentSummary } from '@/lib/match-store/scouting-read'
import { getAllFacts, getVisiblePlayerNames } from '@/lib/match-store/stats-queries'
import { gameRows, headToHead, type GameRow, type HeadToHead } from '@/lib/scouting/head-to-head'
import { battingByPosition, bowlingByOrder, dangerBatters, dangerBowlers, type DangerBatter, type DangerBowler, type OrderBowling, type PositionBatting } from '@/lib/scouting/danger'
import { ourBest, type OurBest } from '@/lib/scouting/our-best'
import { gamePlan, type PlanLine } from '@/lib/scouting/plan'
import { resolveOpponent, type Resolved } from '@/lib/scouting/resolve-opponent'
import { tossOf, type TossSummary } from '@/lib/scouting/toss'
import { totalsOf, type Totals } from '@/lib/scouting/totals'
import { getLabelMap } from '@/lib/stats/label-queries'
import { canonicalGrade } from '@/lib/stats/labels'
import { getStatsSettings } from '@/lib/site-settings'
import { assertSelection } from '@/lib/selector-role'
import type { TypedUser } from 'payload'

/**
 * Opposition scouting for the selector area (wave E spec 3). The matches are read with the Local API and `overrideAccess: true`
 * (selectors get nothing over REST), so every exported function starts with `assertSelection`. Nothing here is cached: the data holds
 * opposition players' names, so each request reads fresh and the result is never put in `unstable_cache` or a tag shared with a public page.
 */

export type ScoutingSettings = { showOppositionNames: boolean; minInnings: number }

async function scoutingSettings(): Promise<ScoutingSettings> {
  const g = (await (await getPayloadClient()).findGlobal({ slug: 'selection-settings', depth: 0 })) as { scouting?: { showOppositionNames?: boolean | null; minInnings?: number | null } | null }
  const min = Number(g.scouting?.minInnings)
  return { showOppositionNames: g.scouting?.showOppositionNames !== false, minInnings: Number.isInteger(min) && min >= 1 ? min : 2 }
}

export type OpponentRow = Pick<OpponentSummary, 'key' | 'label' | 'played' | 'lastDate'>

/** Every opposition with a stored game, for the list page. */
export async function loadOpponentList(user: TypedUser | null | undefined): Promise<OpponentRow[]> {
  assertSelection(user)
  const all = await listOpponents(await getPayloadClient())
  return all.map(({ key, label, played, lastDate }) => ({ key, label, played, lastDate }))
}

/** For each upcoming game's opponent name, the stored opposition it points at (or none, or several). */
export async function resolveOpponents(user: TypedUser | null | undefined, names: readonly string[]): Promise<Record<string, Resolved>> {
  assertSelection(user)
  const wanted = [...new Set(names.filter(Boolean))]
  if (wanted.length === 0) return {}
  const options = await listOpponents(await getPayloadClient())
  return Object.fromEntries(wanted.map((n) => [n, resolveOpponent(n, options)]))
}

export type DangerView =
  | { mode: 'named'; batters: DangerBatter[]; bowlers: DangerBowler[] }
  | { mode: 'positions'; batting: PositionBatting[]; bowling: OrderBowling[] }

export type ScoutingReport = {
  key: string
  label: string
  /** Games stored against them, and whether the report holds only the newest few. */
  total: number
  capped: boolean
  used: number
  /** Imported history games in the report: they count in the ledger and in totals where they have them, and nowhere else. */
  imported: number
  /** True when there are enough games for the plan and rates (`SCOUTING.minSample`). */
  enough: boolean
  minSample: number
  games: GameRow[]
  h2h: HeadToHead
  totals: Totals
  toss: TossSummary
  plan: PlanLine[]
  danger: DangerView
  minInnings: number
  minBalls: number
  best: { batters: OurBest[]; bowlers: OurBest[] }
}

/** One opposition's report, or null for a key that matches no stored game. Opposition names reach the result only when the club-wide setting allows. */
export async function loadScoutingReport(user: TypedUser | null | undefined, key: string): Promise<ScoutingReport | null> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const [loaded, settings, labels, stats] = await Promise.all([loadScoutingMatches(payload, key), scoutingSettings(), getLabelMap(), getStatsSettings()])
  if (!loaded) return null
  const matches = loaded.matches.map((m) => ({ ...m, grade: m.grade ? canonicalGrade(m.grade, labels) : null }))
  const totals = totalsOf(matches)
  const toss = tossOf(matches)
  const min = { minInnings: settings.minInnings, minBalls: SCOUTING.minBalls, top: SCOUTING.topPlayers, recent: SCOUTING.recentCount }
  const danger: DangerView = settings.showOppositionNames
    ? { mode: 'named', batters: dangerBatters(matches, min), bowlers: dangerBowlers(matches, min) }
    : { mode: 'positions', batting: battingByPosition(matches, min.minInnings), bowling: bowlingByOrder(matches, min.minBalls) }
  // Our own players come from the public facts (visible players only), narrowed to these games.
  const [facts, names] = await Promise.all([getAllFacts(), getVisiblePlayerNames()])
  const best = ourBest(facts, new Set(matches.map((m) => m.gameId)), new Map([...names].map(([id, p]) => [id, p.name])), stats.matchMinimums)
  return {
    key, label: loaded.label, total: loaded.total, capped: loaded.capped, used: matches.length, imported: matches.filter((m) => m.source === 'import').length,
    enough: matches.length >= SCOUTING.minSample, minSample: SCOUTING.minSample,
    games: gameRows(matches), h2h: headToHead(matches, SCOUTING.recentCount), totals, toss,
    plan: gamePlan({ matches, totals, toss, minSample: SCOUTING.minSample, earlyWicketRuns: SCOUTING.earlyWicketRuns }),
    danger, minInnings: settings.minInnings, minBalls: SCOUTING.minBalls,
    best: { batters: best.batters.slice(0, SCOUTING.topPlayers), bowlers: best.bowlers.slice(0, SCOUTING.topPlayers) },
  }
}
