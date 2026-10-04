import 'server-only'
import { desc, eq, inArray } from '@payloadcms/db-postgres/drizzle'
import { unstable_cache } from 'next/cache'
import { getPayloadClient } from '@/lib/payload/client'
import { ALL_STATS_TAGS } from '@/lib/stats/tags'
import { playerTables } from './db'
import { MAX_SUGGESTIONS, suggestDuplicates, type DupPlayer, type Suggestion } from './duplicates'
import { MERGE_LOG_TAG } from './merge-core'
import { pairId, pairsSharingMatches } from './same-game'

/**
 * Admin-only queries for the duplicate-players view (W2 spec 6.2): uncached reads of players, seasons and appearances, the
 * ranked suggestion list (cached with the stats tags plus `merge-log`, invalidated by every merge, undo, dismissal and sync),
 * and the recent merges. Never feeds a public page: hidden players are included.
 */
const startYear = (seasonName: string): number | null => {
  const m = /\d{4}/.exec(seasonName)
  return m ? Number(m[0]) : null
}

async function loadSuggestions(): Promise<Suggestion[]> {
  const payload = await getPayloadClient()
  const t = playerTables(payload)
  const db = payload.db.drizzle
  const [players, seasons, dismissed] = await Promise.all([
    db.select({ id: t.players.id, firstName: t.players.firstName, lastName: t.players.lastName, hidden: t.players.hidden }).from(t.players),
    db.select({ player: t.player_seasons.player, seasonName: t.player_seasons.seasonName, seasonStartYear: t.player_seasons.seasonStartYear, teamId: t.player_seasons.teamId, gradeName: t.player_seasons.gradeName, games: t.player_seasons.games }).from(t.player_seasons),
    db.select({ a: t.merge_log.sourcePlayerId, b: t.merge_log.targetPlayer }).from(t.merge_log).where(eq(t.merge_log.kind, 'dismissed')),
  ])
  const byPlayer = new Map<number, DupPlayer>()
  for (const p of players as { id: number; firstName: string; lastName: string | null; hidden: boolean | null }[]) {
    byPlayer.set(Number(p.id), { id: Number(p.id), firstName: p.firstName ?? '', lastName: p.lastName ?? '', hidden: p.hidden === true, games: 0, seasons: [] })
  }
  for (const s of seasons as { player: number; seasonName: string; seasonStartYear: number | string | null; teamId: string; gradeName: string | null; games: number | string }[]) {
    const p = byPlayer.get(Number(s.player))
    if (!p) continue
    p.games += Number(s.games ?? 0)
    p.seasons.push({ seasonStartYear: s.seasonStartYear != null ? Number(s.seasonStartYear) : startYear(String(s.seasonName)), teamKey: String(s.teamId), grade: s.gradeName })
  }
  const dismissedPairs = new Set((dismissed as { a: number | string; b: number | null }[]).filter((d) => d.b != null).map((d) => pairId(Number(d.a), Number(d.b))))
  // Over-fetch, then drop the pairs that played in one game (checked only for the candidates), then cap.
  const candidates = suggestDuplicates([...byPlayer.values()], { dismissed: dismissedPairs, limit: 400 })
  if (!candidates.length) return []
  const ids = [...new Set(candidates.flatMap((c) => [c.a.id, c.b.id]))]
  const apps = (await db.select({ match: t.match_appearances.match, player: t.match_appearances.player }).from(t.match_appearances).where(inArray(t.match_appearances.player, ids))) as { match: number; player: number }[]
  const veto = pairsSharingMatches(apps.map((r) => ({ match: Number(r.match), player: Number(r.player) })), candidates.map((c) => [c.a.id, c.b.id] as [number, number]))
  return candidates.filter((c) => !veto.has(pairId(c.a.id, c.b.id))).slice(0, MAX_SUGGESTIONS)
}

export async function getDuplicateSuggestions(): Promise<Suggestion[]> {
  try {
    return await unstable_cache(loadSuggestions, ['duplicate-suggestions', 'v1'], { tags: [...ALL_STATS_TAGS, MERGE_LOG_TAG], revalidate: 3600 })()
  } catch (err) {
    if (err instanceof Error && /incrementalCache missing/.test(err.message)) return loadSuggestions()
    throw err
  }
}

export type RecentMerge = { id: number; sourceName: string; targetName: string | null; targetId: number | null; at: string; undoable: boolean; status: 'applied' | 'undone'; undoneAt: string | null }

/** The last merges (newest first), with whether each can still be undone. */
export async function getRecentMerges(limit = 15): Promise<RecentMerge[]> {
  const payload = await getPayloadClient()
  const t = playerTables(payload)
  const db = payload.db.drizzle
  const rows = (await db.select().from(t.merge_log).where(eq(t.merge_log.kind, 'merge')).orderBy(desc(t.merge_log.createdAt)).limit(limit)) as Record<string, unknown>[]
  const targetIds = [...new Set(rows.map((r) => r.targetPlayer).filter((v) => v != null).map(Number))]
  const targets = targetIds.length ? ((await db.select({ id: t.players.id, displayName: t.players.displayName, firstName: t.players.firstName, lastName: t.players.lastName }).from(t.players).where(inArray(t.players.id, targetIds))) as Record<string, unknown>[]) : []
  const name = new Map(targets.map((p) => [Number(p.id), String(p.displayName || `${p.firstName} ${p.lastName ?? ''}`).trim()]))
  return rows.map((r) => ({
    id: Number(r.id), sourceName: String(r.sourceName ?? ''), targetId: r.targetPlayer == null ? null : Number(r.targetPlayer),
    targetName: r.targetPlayer == null ? null : (name.get(Number(r.targetPlayer)) ?? null), at: new Date(String(r.createdAt)).toISOString(),
    status: r.status === 'undone' ? 'undone' : 'applied', undoneAt: r.undoneAt ? new Date(String(r.undoneAt)).toISOString() : null,
    undoable: r.status === 'applied' && r.targetPlayer != null,
  }))
}

/** Count for the notification centre. */
export async function countDuplicateSuggestions(): Promise<number> {
  return (await getDuplicateSuggestions()).length
}
