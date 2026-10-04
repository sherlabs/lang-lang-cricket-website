import { and, eq, inArray } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { matchTables } from './db'
import type { BundleRows } from './aggregate'
import type { AppearanceRow, BattingRow, BowlingRow, FieldingRow, InningsRow, MatchRow } from '@/lib/playhq/match-rows'

/**
 * Reads stored match rows back into the shape the mapper produced (`BundleRows`), for the nightly
 * reconciliation and tests. Staff and sync use only; it states no visibility filter, so it must
 * never feed a public page (`queries.ts` is the public path).
 */

type Row = Record<string, unknown>
const n = (v: unknown) => (v == null ? 0 : Number(v))
const nn = (v: unknown) => (v == null ? null : Number(v))
const b = (v: unknown) => v === true
const s = (v: unknown) => (v == null ? null : String(v))

/** Appearances as stored: the cached `player` link is kept (club side only), so a reader can resolve and filter names. */
export type StoredBundle = Omit<BundleRows, 'appearances'> & {
  /** The stored `matches` row id (set by `readStoredBundles`; stats facts use it as the match key). */
  id?: number
  appearances: (AppearanceRow & { player: number | null })[]
}

export async function readStoredBundles(payload: Payload, filter?: { gameIds?: string[]; /** Restrict to one origin: the sync and the reconciliation read `playhq` only. */ source?: 'playhq' | 'import' }): Promise<StoredBundle[]> {
  const t = matchTables(payload)
  const db = payload.db.drizzle
  const conds = [filter?.gameIds ? inArray(t.matches.gameId, filter.gameIds) : undefined, filter?.source ? eq(t.matches.source, filter.source) : undefined].filter(Boolean)
  const matches: Row[] = await (conds.length ? db.select().from(t.matches).where(and(...conds)) : db.select().from(t.matches))
  const ids = matches.map((m) => Number(m.id))
  if (conds.length && ids.length === 0) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (table: any): Promise<Row[]> => (conds.length ? db.select().from(table).where(inArray(table.match, ids)) : db.select().from(table))
  const [innings, appearances, batting, bowling, fielding] = await Promise.all([
    all(t.match_innings), all(t.match_appearances), all(t.match_batting), all(t.match_bowling), all(t.match_fielding),
  ])
  const group = (rows: Row[]) => {
    const out = new Map<number, Row[]>()
    for (const r of rows) {
      const k = Number(r.match)
      const list = out.get(k)
      if (list) list.push(r)
      else out.set(k, [r])
    }
    return out
  }
  const inn = group(innings), app = group(appearances), bat = group(batting), bowl = group(bowling), fld = group(fielding)
  const seqOf = new Map(innings.map((r) => [Number(r.id), Number(r.sequenceNo)]))
  const wanted = filter?.gameIds ? new Set(filter.gameIds) : null
  const out: StoredBundle[] = []
  for (const m of matches) {
    if (wanted && !wanted.has(String(m.gameId))) continue
    const id = Number(m.id)
    const match: MatchRow = {
      gameId: String(m.gameId), status: String(m.status), type: String(m.type), seasonName: String(m.seasonName), seasonStartYear: nn(m.seasonStartYear),
      competitionName: String(m.competitionName ?? ''), gradeId: s(m.gradeId), gradeName: s(m.gradeName), roundName: s(m.roundName), roundAbbr: s(m.roundAbbr),
      isFinalRound: b(m.isFinalRound), startsAt: s(m.startsAt), localDate: s(m.localDate), days: n(m.days), venueName: s(m.venueName), venueSuburb: s(m.venueSuburb),
      clubTeamId: String(m.clubTeamId), clubTeamName: String(m.clubTeamName), opponentTeamId: s(m.opponentTeamId), opponentName: s(m.opponentName),
      opponentOrgId: s(m.opponentOrgId), opponentOrgName: s(m.opponentOrgName), isHome: b(m.isHome), tossWinnerTeamId: s(m.tossWinnerTeamId),
      tossChoice: s(m.tossChoice) as MatchRow['tossChoice'], clubWonToss: m.clubWonToss == null ? null : b(m.clubWonToss),
      clubOutcome: s(m.clubOutcome), opponentOutcome: s(m.opponentOutcome), result: s(m.result) as MatchRow['result'],
      byForfeit: b(m.byForfeit), onFirstInnings: b(m.onFirstInnings), playhqUpdatedAt: s(m.playhqUpdatedAt),
    }
    out.push({
      id,
      match,
      innings: (inn.get(id) ?? []).map<InningsRow>((r) => ({
        sequenceNo: n(r.sequenceNo), periodName: s(r.periodName), battingTeamId: s(r.battingTeamId), bowlingTeamId: s(r.bowlingTeamId), isClubBatting: b(r.isClubBatting),
        periodStatus: s(r.periodStatus), played: b(r.played), declared: b(r.declared), allOut: b(r.allOut), totalRuns: n(r.totalRuns), totalWickets: n(r.totalWickets),
        totalBalls: n(r.totalBalls), extrasTotal: n(r.extrasTotal), wides: n(r.wides), noBalls: n(r.noBalls), byes: n(r.byes), legByes: n(r.legByes), penalty: n(r.penalty),
        hasFallOfWickets: b(r.hasFallOfWickets), hasBowlingData: b(r.hasBowlingData), hasBallData: b(r.hasBallData),
      })),
      appearances: (app.get(id) ?? []).map((r) => ({
        player: nn(r.player), appearanceId: String(r.appearanceId), teamId: String(r.teamId), isClubSide: b(r.isClubSide), nameKey: s(r.nameKey), displayName: s(r.displayName),
        captainRole: s(r.captainRole), isFillIn: b(r.isFillIn), isRegisteredPlayer: b(r.isRegisteredPlayer), playerNumber: nn(r.playerNumber),
      })),
      batting: (bat.get(id) ?? []).map<BattingRow>((r) => ({
        inningsSeq: seqOf.get(Number(r.innings)) ?? -1, appearanceId: String(r.appearanceId), position: n(r.position), battingStatus: String(r.battingStatus) as BattingRow['battingStatus'],
        runs: n(r.runs), balls: nn(r.balls), fours: nn(r.fours), sixes: nn(r.sixes), dismissalType: s(r.dismissalType) as BattingRow['dismissalType'],
        bowlerAppearanceId: s(r.bowlerAppearanceId), fielderAppearanceId: s(r.fielderAppearanceId), fowWicket: nn(r.fowWicket), fowRuns: nn(r.fowRuns),
      })),
      bowling: (bowl.get(id) ?? []).map<BowlingRow>((r) => ({
        inningsSeq: seqOf.get(Number(r.innings)) ?? -1, appearanceId: String(r.appearanceId), order: n(r.order), balls: n(r.balls), maidens: n(r.maidens),
        runs: n(r.runs), wickets: n(r.wickets), wides: n(r.wides), noBalls: n(r.noBalls),
      })),
      fielding: (fld.get(id) ?? []).map<FieldingRow>((r) => ({
        inningsSeq: seqOf.get(Number(r.innings)) ?? -1, appearanceId: String(r.appearanceId), catches: n(r.catches), keeperCatches: n(r.keeperCatches),
        stumpings: n(r.stumpings), runOutsAssisted: n(r.runOutsAssisted), runOutsUnassisted: n(r.runOutsUnassisted),
      })),
    })
  }
  return out
}
