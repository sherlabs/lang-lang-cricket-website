import 'server-only'
import { inArray } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import type { BattingStatus, DismissalType, InningsRow, MatchRow } from '@/lib/playhq/match-rows'
import { matchTables } from './db'
import { formatDismissal, resolveRowName, type PlayerNames } from './names'
import { readStoredBundles, type StoredBundle } from './read'

/**
 * Public read path of the match store (WP-M, spec 4.2). The collections are staff-read only, so
 * pages read through here, and every helper restates its own filter (the Local API ignores access):
 * FINAL matches only, a club-side row needs a resolved, non-hidden player, and a hidden player's
 * name is suppressed ("a club player") even inside someone else's dismissal. W1 ships only
 * `getMatchByGameId`; list and player queries arrive in W2 against the indexes in the spec.
 */

export type StoredBatting = {
  appearanceId: string; name: string; isClubSide: boolean; position: number; status: BattingStatus
  runs: number; balls: number | null; fours: number | null; sixes: number | null
  dismissalType: DismissalType | null; dismissal: string; fowWicket: number | null; fowRuns: number | null
}
export type StoredBowling = { appearanceId: string; name: string; isClubSide: boolean; order: number; balls: number; maidens: number; runs: number; wickets: number; wides: number; noBalls: number }
export type StoredFielding = { appearanceId: string; name: string; isClubSide: boolean; catches: number; keeperCatches: number; stumpings: number; runOutsAssisted: number; runOutsUnassisted: number }
export type StoredInnings = InningsRow & { batting: StoredBatting[]; didNotBat: string[]; bowling: StoredBowling[]; fielding: StoredFielding[] }
export type StoredMatch = { match: MatchRow; innings: StoredInnings[] }

/** Pure: shapes one stored match for a reader, applying the visibility rules. `players` holds every club player the rows link to. */
export function shapeStoredMatch(bundle: StoredBundle, players: PlayerNames): StoredMatch | null {
  if (bundle.match.status !== 'FINAL') return null
  const appearances = new Map(bundle.appearances.map((a) => [a.appearanceId, a]))
  const nameOf = (id: string | null): string | null => {
    const a = id ? appearances.get(id) : undefined
    if (!a) return null
    return resolveRowName({ player: a.isClubSide ? a.player : null, displayName: a.isClubSide ? null : a.displayName }, players)
  }
  /** A club-side row is shown only for a resolved, non-hidden player. */
  const shown = (id: string) => {
    const a = appearances.get(id)
    if (!a) return false
    if (!a.isClubSide) return true
    const p = a.player == null ? undefined : players.get(a.player)
    return !!p && !p.hidden
  }
  const innings = [...bundle.innings].sort((a, b) => a.sequenceNo - b.sequenceNo).map<StoredInnings>((inn) => {
    const batting = bundle.batting.filter((r) => r.inningsSeq === inn.sequenceNo && shown(r.appearanceId))
    return {
      ...inn,
      batting: batting
        .filter((r) => r.battingStatus !== 'did_not_bat')
        .sort((a, b) => a.position - b.position)
        .map((r) => ({
          appearanceId: r.appearanceId, name: nameOf(r.appearanceId)!, isClubSide: appearances.get(r.appearanceId)!.isClubSide, position: r.position,
          status: r.battingStatus, runs: r.runs, balls: r.balls, fours: r.fours, sixes: r.sixes, dismissalType: r.dismissalType,
          dismissal: formatDismissal(r.battingStatus, r.dismissalType, nameOf(r.bowlerAppearanceId), nameOf(r.fielderAppearanceId)),
          fowWicket: r.fowWicket, fowRuns: r.fowRuns,
        })),
      didNotBat: batting.filter((r) => r.battingStatus === 'did_not_bat').sort((a, b) => a.position - b.position).map((r) => nameOf(r.appearanceId)!),
      bowling: bundle.bowling
        .filter((r) => r.inningsSeq === inn.sequenceNo && shown(r.appearanceId))
        .sort((a, b) => a.order - b.order)
        .map((r) => ({ ...r, name: nameOf(r.appearanceId)!, isClubSide: appearances.get(r.appearanceId)!.isClubSide })),
      fielding: bundle.fielding
        .filter((r) => r.inningsSeq === inn.sequenceNo && shown(r.appearanceId))
        .map((r) => ({ ...r, name: nameOf(r.appearanceId)!, isClubSide: appearances.get(r.appearanceId)!.isClubSide })),
    }
  })
  return { match: bundle.match, innings }
}

async function loadPlayerNames(payload: Payload, ids: number[]): Promise<PlayerNames> {
  if (!ids.length) return new Map()
  const t = matchTables(payload)
  const rows: { id: number; hidden: boolean | null; displayName: string | null; firstName: string | null; lastName: string | null }[] = await payload.db.drizzle
    .select({ id: t.players.id, hidden: t.players.hidden, displayName: t.players.displayName, firstName: t.players.firstName, lastName: t.players.lastName })
    .from(t.players)
    .where(inArray(t.players.id, ids))
  return new Map(rows.map((r) => [r.id, { name: r.displayName?.trim() || `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(), hidden: r.hidden === true }]))
}

/** One finished match with innings, batting, bowling and fielding, names resolved. Null when unknown or not FINAL. */
export async function getMatchByGameId(gameId: string): Promise<StoredMatch | null> {
  const payload = await getPayloadClient()
  const [bundle] = await readStoredBundles(payload, { gameIds: [gameId] })
  if (!bundle) return null
  const ids = [...new Set(bundle.appearances.flatMap((a) => (a.isClubSide && a.player != null ? [a.player] : [])))]
  return shapeStoredMatch(bundle, await loadPlayerNames(payload, ids))
}
