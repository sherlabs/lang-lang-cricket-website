import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { playerHonours, playerSeasons, players, type Player, type PlayerHonour, type PlayerSeason } from '@/db/schema'
import type { SeasonCounts } from './season-math'
import { careerTotals, isActive, playerName, splitPlayers, toCard, yearsLabel, type SeasonLite } from './view'

export async function listPublicPlayers() {
  const [all, seasons] = await Promise.all([
    db.select().from(players).where(eq(players.hidden, false)),
    db.select({ playerId: playerSeasons.playerId, seasonName: playerSeasons.seasonName, seasonOrder: playerSeasons.seasonOrder, teamName: playerSeasons.teamName }).from(playerSeasons),
  ])
  const byPlayer = new Map<number, SeasonLite[]>()
  for (const s of seasons) byPlayer.set(s.playerId, [...(byPlayer.get(s.playerId) ?? []), s])
  return splitPlayers(all.map((player) => ({ player, seasons: byPlayer.get(player.id) ?? [] })))
}

export type PlayerProfile = {
  player: Player; active: boolean; name: string; yearsLabel: string; grades: string[]
  honours: PlayerHonour[]; seasons: PlayerSeason[]; career: SeasonCounts | null
}

export async function getPlayerProfile(slug: string): Promise<PlayerProfile | null> {
  const [player] = await db.select().from(players).where(eq(players.slug, slug)).limit(1)
  if (!player || player.hidden) return null
  const [honours, seasons] = await Promise.all([
    db.select().from(playerHonours).where(eq(playerHonours.playerId, player.id)).orderBy(asc(playerHonours.sortOrder), asc(playerHonours.id)),
    db.select().from(playerSeasons).where(eq(playerSeasons.playerId, player.id)).orderBy(asc(playerSeasons.seasonOrder), asc(playerSeasons.teamName)),
  ])
  const card = toCard(player, seasons)
  return {
    player, active: isActive(player), name: playerName(player), yearsLabel: yearsLabel(player, seasons), grades: card.grades,
    honours, seasons, career: seasons.length ? careerTotals(seasons) : null,
  }
}
