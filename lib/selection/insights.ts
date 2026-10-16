import type { Payload, Where } from 'payload'
import { formatBatting, formatBowling, FORM_COUNT, FORM_WINDOW_DAYS, recentEntries, type BatEntry, type BowlEntry } from './form'
import { suggestRole, type RoleEvidence, type RoleOrUnknown } from './roles'
import { idOf } from './store'

/**
 * What the team builder knows about a player from stored games and season totals (announce-teams spec 5.2): the raw last-five
 * batting and bowling lines, and a suggested role. Read-only, runs with the Local API's access override, so the caller has
 * already checked the role (`lib/selector-team-queries.ts`). Only final matches inside the form window count; a fill-in row with
 * no player link is never attributed to anyone. A player with no stored rows gets "No data", never zeros.
 */
export type PlayerInsight = { batting: string; bowling: string; battingEntries: BatEntry[]; bowlingEntries: BowlEntry[]; suggested: RoleOrUnknown }

const CHUNK = 400

export async function loadInsights(payload: Payload, playerIds: readonly number[], now: Date = new Date()): Promise<Map<number, PlayerInsight>> {
  const ids = [...new Set(playerIds)]
  const out = new Map<number, PlayerInsight>()
  if (!ids.length) return out
  const cutoff = new Date(now.getTime() - FORM_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)

  const matches = await payload.find({ collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, { localDate: { greater_than_equal: cutoff } }] } as Where, limit: 5000, pagination: false, depth: 0, select: { localDate: true }, overrideAccess: true })
  const dateOf = new Map<number, string>(matches.docs.map((m) => [m.id, (m as { localDate?: string | null }).localDate ?? '']))
  const matchIds = [...dateOf.keys()]

  // appearance key (match:appearanceId) -> player and date
  const appearances = new Map<string, { playerId: number; date: string }>()
  if (matchIds.length) {
    const rows = await payload.find({ collection: 'match-appearances', where: { and: [{ player: { in: ids } }, { match: { in: matchIds } }] } as Where, limit: 20000, pagination: false, depth: 0, select: { match: true, appearanceId: true, player: true }, overrideAccess: true })
    for (const a of rows.docs) {
      const match = idOf(a.match)
      const player = idOf(a.player)
      if (match == null || player == null) continue
      appearances.set(`${match}:${a.appearanceId}`, { playerId: player, date: dateOf.get(match) ?? '' })
    }
  }

  const bat = new Map<number, BatEntry[]>()
  const bowl = new Map<number, BowlEntry[]>()
  const keeper = new Map<number, number>()
  const appearanceIds = [...new Set([...appearances.keys()].map((k) => k.slice(k.indexOf(':') + 1)))]
  for (let i = 0; i < appearanceIds.length; i += CHUNK) {
    const part = appearanceIds.slice(i, i + CHUNK)
    const scope = { and: [{ match: { in: matchIds } }, { appearanceId: { in: part } }] } as Where
    const [batting, bowling, fielding] = await Promise.all([
      payload.find({ collection: 'match-batting', where: scope, limit: 20000, pagination: false, depth: 0, select: { match: true, appearanceId: true, runs: true, battingStatus: true }, overrideAccess: true }),
      payload.find({ collection: 'match-bowling', where: scope, limit: 20000, pagination: false, depth: 0, select: { match: true, appearanceId: true, wickets: true, runs: true }, overrideAccess: true }),
      payload.find({ collection: 'match-fielding', where: scope, limit: 20000, pagination: false, depth: 0, select: { match: true, appearanceId: true, keeperCatches: true, stumpings: true }, overrideAccess: true }),
    ])
    for (const b of batting.docs) {
      const who = appearances.get(`${idOf(b.match)}:${b.appearanceId}`)
      if (!who || b.battingStatus === 'did_not_bat' || b.battingStatus === 'unknown' || typeof b.runs !== 'number') continue
      bat.set(who.playerId, [...(bat.get(who.playerId) ?? []), { date: who.date, runs: b.runs, notOut: b.battingStatus === 'not_out' }])
    }
    for (const b of bowling.docs) {
      const who = appearances.get(`${idOf(b.match)}:${b.appearanceId}`)
      if (!who || typeof b.wickets !== 'number' || typeof b.runs !== 'number') continue
      bowl.set(who.playerId, [...(bowl.get(who.playerId) ?? []), { date: who.date, wickets: b.wickets, runs: b.runs }])
    }
    for (const f of fielding.docs) {
      const who = appearances.get(`${idOf(f.match)}:${f.appearanceId}`)
      if (!who) continue
      keeper.set(who.playerId, (keeper.get(who.playerId) ?? 0) + (f.keeperCatches ?? 0) + (f.stumpings ?? 0))
    }
  }

  // Role evidence: the last two season groups (seasonOrder 0 and 1) and the keeper actions above.
  const seasons = await payload.find({ collection: 'player-seasons', where: { and: [{ player: { in: ids } }, { seasonOrder: { less_than_equal: 1 } }] } as Where, limit: 20000, pagination: false, depth: 0, select: { player: true, bowlBalls: true, batInnings: true, batRuns: true, batNotOuts: true }, overrideAccess: true })
  const evidence = new Map<number, RoleEvidence>()
  for (const id of ids) evidence.set(id, { canKeep: false, keeperActions: keeper.get(id) ?? 0, bowlBalls: 0, batInnings: 0, batRuns: 0, batNotOuts: 0 })
  for (const s of seasons.docs) {
    const e = evidence.get(idOf(s.player) ?? -1)
    if (!e) continue
    e.bowlBalls += s.bowlBalls ?? 0
    e.batInnings += s.batInnings ?? 0
    e.batRuns += s.batRuns ?? 0
    e.batNotOuts += s.batNotOuts ?? 0
  }

  for (const id of ids) {
    const b = recentEntries(bat.get(id) ?? [], now, FORM_WINDOW_DAYS, FORM_COUNT)
    const w = recentEntries(bowl.get(id) ?? [], now, FORM_WINDOW_DAYS, FORM_COUNT)
    out.set(id, { batting: formatBatting(b), bowling: formatBowling(w), battingEntries: b, bowlingEntries: w, suggested: suggestRole(evidence.get(id)!) })
  }
  return out
}
