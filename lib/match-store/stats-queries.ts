import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { cached, getVisibleStatData } from '@/lib/stats/queries'
import { assembleFacts, deriveFacts, filterFacts, mergeFactSets, playerFacts } from '@/lib/stats/match/facts'
import { decodeFacts, encodeFacts, type SlimFacts } from '@/lib/stats/match/codec'
import { coverageOf, type MatchCoverage } from '@/lib/stats/match/coverage'
import { PROFILE_MAX_SEASONS, STATLAB_MAX_SEASONS } from '@/lib/stats/match/limits'
import type { FactSet, MatchHeader } from '@/lib/stats/match/types'
import { classifyGrade, type GradeCategory, type GradeRule } from '@/lib/stats/categories'
import { sameLabel } from '@/lib/stats/labels'
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

async function loadSeasonYears(): Promise<number[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, { seasonStartYear: { exists: true } }] },
    pagination: false, depth: 0, sort: 'id', select: { seasonStartYear: true },
  })
  return [...new Set(docs.map((d) => Number(d.seasonStartYear)).filter(Number.isFinite))].sort((a, b) => b - a)
}

/** Season start years that have stored FINAL matches, newest first. */
export const getMatchSeasonYears = (): Promise<number[]> => cached(['match-season-years'], loadSeasonYears)

async function loadSeasonFacts(year: number): Promise<SlimFacts> {
  const payload = await getPayloadClient()
  const [matches, players] = await Promise.all([
    payload.find({
      collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, { seasonStartYear: { equals: year } }] },
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

/** Facts for the given seasons, bounded to the newest `max` (the cap that keeps a wide request cheap). */
export async function getFactsFor(seasonYears: readonly number[], max: number = STATLAB_MAX_SEASONS): Promise<FactSet> {
  const years = [...new Set(seasonYears)].sort((a, b) => b - a).slice(0, max)
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

export const filterMatchFacts = (set: FactSet, f: MatchFilter): FactSet => filterFacts(set, matchKeeper(f))

/** Names of visible players for partnership and ranking lists. */
export async function getVisiblePlayerNames() {
  return (await getVisibleStatData()).players
}
