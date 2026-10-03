import 'server-only'
import { cache } from 'react'
import type { Player, PlayerHonour, PlayerSeason } from '@/lib/domain'
import { getPayloadClient } from '@/lib/payload/client'
import { toPlayer, toPlayerSeason } from '@/lib/payload/mappers'
import type { SeasonCounts } from './season-math'
import type { Baseline } from '@/lib/stats/milestones'
import { careerTotals, isActive, playerName, splitPlayers, toCard, yearsLabel, type SeasonLite } from './view'

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
  return splitPlayers(players.docs.map((d) => ({ player: toPlayer(d), seasons: byPlayer.get(d.id) ?? [] })), teamNamePrefix)
}

export type PlayerProfile = {
  player: Player; active: boolean; name: string; yearsLabel: string; grades: string[]
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
  const player = toPlayer(doc)
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
    player, active: isActive(player), name: playerName(player), yearsLabel: yearsLabel(player, seasons), grades: card.grades,
    honours, seasons, career: seasons.length ? careerTotals(seasons) : null,
    baseline: { games: Number(doc.baselineGames ?? 0), runs: Number(doc.baselineRuns ?? 0), wickets: Number(doc.baselineWickets ?? 0), catches: Number(doc.baselineCatches ?? 0) },
  }
})
