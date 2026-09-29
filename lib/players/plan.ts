import type { PlayerSeasonStats } from '@/lib/playhq/types'
import { slugify } from '@/lib/slugify'
import { combineCounts, countsFromStats, type SeasonCounts } from './season-math'

export type TeamAggregate = { seasonName: string; seasonOrder: number; teamId: string; teamName: string; gradeName: string | null; stats: PlayerSeasonStats[] }
export type NewPlayer = { nameKey: string; slug: string; firstName: string; lastName: string }
export type PlannedSeasonRow = SeasonCounts & {
  playerId: number | null      // existing player
  newNameKey: string | null    // new player (resolved to an id after insert)
  seasonName: string; seasonOrder: number; teamId: string; teamName: string; gradeName: string | null
}
export type SyncPlan = { newPlayers: NewPlayer[]; seasonRows: PlannedSeasonRow[]; activePlayerIds: number[]; activeNewNameKeys: string[] }

export const ACTIVE_MAX_SEASON_ORDER = 1

export function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base, n = 2
  while (taken.has(slug)) slug = `${base}-${n++}`
  taken.add(slug)
  return slug
}

export function buildSyncPlan(aggregates: TeamAggregate[], aliases: Map<string, number>, takenSlugs: Set<string>): SyncPlan {
  const taken = new Set(takenSlugs)
  const newPlayers = new Map<string, NewPlayer>()
  const rows = new Map<string, PlannedSeasonRow>() // `${ref}|${teamId}`
  const activeIds = new Set<number>(), activeNew = new Set<string>()

  for (const a of aggregates) {
    for (const s of a.stats) {
      const key = s.key.trim()
      const playerId = aliases.get(key) ?? null
      if (playerId === null && !newPlayers.has(key)) {
        newPlayers.set(key, { nameKey: key, slug: uniqueSlug(slugify(`${s.firstName} ${s.lastName}`), taken), firstName: s.firstName, lastName: s.lastName.trim() })
      }
      const ref = playerId !== null ? `id:${playerId}` : `new:${key}`
      const rowKey = `${ref}|${a.teamId}`
      const counts = countsFromStats(s)
      const prev = rows.get(rowKey)
      rows.set(rowKey, {
        ...(prev ? combineCounts(prev, counts) : counts),
        playerId, newNameKey: playerId === null ? key : null,
        seasonName: a.seasonName, seasonOrder: a.seasonOrder, teamId: a.teamId, teamName: a.teamName, gradeName: a.gradeName,
      })
      if (a.seasonOrder <= ACTIVE_MAX_SEASON_ORDER) {
        if (playerId !== null) activeIds.add(playerId)
        else activeNew.add(key)
      }
    }
  }
  return { newPlayers: [...newPlayers.values()], seasonRows: [...rows.values()], activePlayerIds: [...activeIds], activeNewNameKeys: [...activeNew] }
}
