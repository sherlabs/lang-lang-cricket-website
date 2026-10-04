import 'server-only'
import { cache } from 'react'
import type { Player, PlayerHonour, PlayerSeason } from '@/lib/domain'
import { getLinkedPeople } from '@/lib/people-queries'
import { resolvePlayerIdentity } from '@/lib/identity'
import { getPayloadClient } from '@/lib/payload/client'
import { toPlayer, toPlayerSeason } from '@/lib/payload/mappers'
import type { SeasonCounts } from './season-math'
import type { Baseline } from '@/lib/stats/milestones'
import { careerTotals, isActive, shownName, splitPlayers, toCard, yearsLabel, type SeasonLite } from './view'

/**
 * Public player queries (spec §14) on the Local API. It runs with `overrideAccess`, so every
 * query states its own `hidden: false` filter, and player reads pass `joins: false` (the
 * seasons/aliases joins are admin-only data).
 */
export async function listPublicPlayers(teamNamePrefix?: string) {
  const payload = await getPayloadClient()
  const [players, seasons] = await Promise.all([
    payload.find({ collection: 'players', where: { hidden: { equals: false } }, depth: 1, joins: false, pagination: false, sort: 'id' }),
    payload.find({
      collection: 'player-seasons',
      pagination: false,
      depth: 0,
      sort: 'id',
      select: { player: true, seasonName: true, seasonOrder: true, teamName: true },
    }),
  ])
  const byPlayer = new Map<number, SeasonLite[]>()
  for (const d of seasons.docs) {
    const playerId = typeof d.player === 'number' ? d.player : d.player.id
    byPlayer.set(playerId, [...(byPlayer.get(playerId) ?? []), { seasonName: d.seasonName, seasonOrder: d.seasonOrder, teamName: d.teamName }])
  }
  // One photo rule (lib/identity.ts): the player's own picture, else the linked committee person's.
  const people = await getLinkedPeople(players.docs.map((d) => d.id))
  return splitPlayers(
    players.docs.map((d) => {
      const player = toPlayer(d)
      const photoUrl = resolvePlayerIdentity({ name: shownName(player), photoUrl: player.photoUrl }, people.get(d.id)).photoUrl
      return { player: { ...player, photoUrl }, seasons: byPlayer.get(d.id) ?? [] }
    }),
    teamNamePrefix,
  )
}

export type PlayerProfile = {
  player: Player; active: boolean; name: string; yearsLabel: string; grades: string[]
  /** The linked committee role (e.g. "President"), or null. Shown under the name. */
  clubRole: string | null
  honours: PlayerHonour[]; seasons: PlayerSeason[]; career: SeasonCounts | null
  /** Pre-PlayHQ totals recorded by an admin (zeros when none); used by milestones only. */
  baseline: Baseline
}

/** Shared by `generateMetadata` and the page through React `cache()` (one fetch per request). */
export const getPlayerProfile = cache(async (slug: string, teamNamePrefix?: string): Promise<PlayerProfile | null> => {
  if (!slug) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'players',
    where: { and: [{ slug: { equals: slug } }, { hidden: { equals: false } }] },
    depth: 1,
    joins: false,
    limit: 1,
    pagination: false,
  })
  const doc = docs[0]
  if (!doc) return null
  const own = toPlayer(doc)
  const person = (await getLinkedPeople([own.id])).get(own.id)
  const identity = resolvePlayerIdentity({ name: shownName(own), photoUrl: own.photoUrl }, person)
  const player = { ...own, photoUrl: identity.photoUrl }
  const { docs: seasonDocs } = await payload.find({
    collection: 'player-seasons',
    where: { player: { equals: player.id } },
    sort: ['seasonOrder', 'teamName'],
    pagination: false,
    depth: 0,
  })
  const seasons = seasonDocs.map(toPlayerSeason)
  const honours: PlayerHonour[] = (doc.honours ?? []).map((h, i) => ({ id: h.id ?? String(i), years: h.years ?? '', title: h.title ?? '' }))
  const card = toCard(player, seasons, teamNamePrefix)
  return {
    player, active: isActive(player), name: identity.name, clubRole: identity.clubRole, yearsLabel: yearsLabel(player, seasons), grades: card.grades,
    honours, seasons, career: seasons.length ? careerTotals(seasons) : null,
    baseline: { games: Number(doc.baselineGames ?? 0), runs: Number(doc.baselineRuns ?? 0), wickets: Number(doc.baselineWickets ?? 0), catches: Number(doc.baselineCatches ?? 0) },
  }
})
