import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { cached, getVisibleStatData } from '@/lib/stats/queries'
import { assembleFacts, deriveFacts, mergeFactSets, playerFacts } from '@/lib/stats/match/facts'
import { decodeFacts, encodeFacts, type SlimFacts } from '@/lib/stats/match/codec'
import { coverageOf, type MatchCoverage } from '@/lib/stats/match/coverage'
import { oppositionKey, oppositionLabel } from '@/lib/stats/match/opposition-key'
import { PROFILE_MAX_SEASONS, STATLAB_MAX_SEASONS } from '@/lib/stats/match/limits'
import type { FactSet } from '@/lib/stats/match/types'
import { readStoredBundles } from './read'

/**
 * The only reader of match rows for public stats pages (W2 spec 4.1). Every query restates its own
 * filter, because the Local API ignores access rules: FINAL matches only, a club-side row only for
 * a visible (non-hidden, resolved) player, and a hidden player appears nowhere, not even as a
 * partner (partnerships carry `null` for a hidden partner). The collections stay staff-read only.
 *
 * One cached slim blob per season (`['match-facts', year]`, tags `ALL_STATS_TAGS`); a profile reads
 * the season blobs and filters rows in memory, so there is no per-player cache and no per-request scan.
 */

/**
 * Key of the blob that holds FINAL matches whose season name has no four-digit year
 * (`seasonStartYear` is null). It sorts after every real year and is never dropped by a season cap,
 * so such a club (or a stray season) still gets its match data instead of silently losing it.
 */
export const NO_YEAR_SEASON = 0

async function loadSeasonYears(): Promise<number[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'matches', where: { status: { equals: 'FINAL' } },
    pagination: false, depth: 0, sort: 'id', select: { seasonStartYear: true },
  })
  const years = docs.map((d) => (d.seasonStartYear == null ? NO_YEAR_SEASON : Number(d.seasonStartYear))).map((y) => (Number.isFinite(y) ? y : NO_YEAR_SEASON))
  return [...new Set(years)].sort((a, b) => b - a)
}

/** Season start years that have stored FINAL matches, newest first. */
export const getMatchSeasonYears = (): Promise<number[]> => cached(['match-season-years'], loadSeasonYears)

async function loadSeasonFacts(year: number): Promise<SlimFacts> {
  const payload = await getPayloadClient()
  const [matches, players] = await Promise.all([
    payload.find({
      collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, (year === NO_YEAR_SEASON ? { seasonStartYear: { exists: false } } : { seasonStartYear: { equals: year } })] },
      pagination: false, depth: 0, sort: 'id', select: { gameId: true },
    }),
    payload.find({ collection: 'players', where: { hidden: { equals: false } }, pagination: false, depth: 0, joins: false, sort: 'id', select: { slug: true } }),
  ])
  const visible = new Set(players.docs.map((p) => p.id))
  const gameIds = matches.docs.map((d) => String(d.gameId))
  const bundles = gameIds.length ? await readStoredBundles(payload, { gameIds }) : []
  const parts = bundles.flatMap((b) => {
    const f = deriveFacts(b, visible)
    return f ? [f] : []
  })
  return encodeFacts(assembleFacts(parts))
}

/** One season's facts (cached). Visible players only. */
export async function getSeasonFacts(seasonStartYear: number): Promise<FactSet> {
  return decodeFacts(await cached(['match-facts', String(seasonStartYear)], () => loadSeasonFacts(seasonStartYear)))
}

export type OppositionOption = { key: string; label: string }

async function loadOppositionOptions(): Promise<OppositionOption[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'matches', where: { status: { equals: 'FINAL' } }, pagination: false, depth: 0, sort: 'localDate',
    select: { opponentOrgId: true, opponentOrgName: true, opponentName: true, localDate: true },
  })
  // Oldest to newest, so the label follows the most recent meeting.
  const by = new Map<string, string>()
  for (const d of docs) {
    const ref = { opponentOrgId: d.opponentOrgId ?? null, opponentOrgName: d.opponentOrgName ?? null, opponentName: d.opponentName ?? null }
    by.set(oppositionKey(ref), oppositionLabel(ref))
  }
  return [...by].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key))
}

/** Every opposition with a stored FINAL match (StatLab's opposition filter). Names only, no individuals. */
export const getOppositionOptions = (): Promise<OppositionOption[]> => cached(['match-opposition-options'], loadOppositionOptions)

/** Facts for the given seasons, bounded to the newest `max` (the cap that keeps a wide request cheap). */
export async function getFactsFor(seasonYears: readonly number[], max: number = STATLAB_MAX_SEASONS): Promise<FactSet> {
  const unique = [...new Set(seasonYears)].sort((a, b) => b - a)
  const years = [...unique.filter((y) => y !== NO_YEAR_SEASON).slice(0, max), ...unique.filter((y) => y === NO_YEAR_SEASON)]
  return mergeFactSets(await Promise.all(years.map(getSeasonFacts)))
}

/** Every stored season (newest `PROFILE_MAX_SEASONS`). */
export async function getAllFacts(max: number = PROFILE_MAX_SEASONS): Promise<FactSet> {
  return getFactsFor(await getMatchSeasonYears(), max)
}

/** Coverage of everything stored. */
export async function getMatchCoverage(): Promise<MatchCoverage> {
  return coverageOf(await getAllFacts())
}

export type PlayerMatchFacts = { player: FactSet; coverage: MatchCoverage }

/**
 * A visible player's rows: the player's own slice (matches, innings, facts, and the partnerships
 * they took part in, with `null` for a hidden partner). Null when the player has no stored match.
 */
export async function getPlayerMatchFacts(playerId: number): Promise<PlayerMatchFacts | null> {
  const all = await getAllFacts()
  const player = playerFacts(all, playerId)
  if (player.appearances.length === 0) return null
  return { player, coverage: coverageOf(player) }
}

export { filterMatchFacts, matchKeeper, type MatchFilter } from '@/lib/stats/match/filter'

/** Names of visible players for partnership and ranking lists. */
export async function getVisiblePlayerNames() {
  return (await getVisibleStatData()).players
}
