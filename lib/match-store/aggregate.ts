import { EMPTY_COUNTS, type SeasonCounts } from '@/lib/players/season-math'
import type { AppearanceRow, BattingRow, BowlingRow, FieldingRow, InningsRow, MatchRow } from '@/lib/playhq/match-rows'
import type { BattingStatus } from '@/lib/playhq/match-rows'
import { displayNameFromKey } from './names'

/**
 * Season counts derived from stored match rows (WP-M, spec M3). Pure, no database. It reuses the
 * rules of `aggregatePlayers`: only played innings count, every non-DNB row is an innings
 * (including `unknown`), the high score tie goes to the not-out score, best figures are most
 * wickets then fewest runs, and a null `balls`/`fours`/`sixes` (not recorded) adds nothing.
 */

export type PlayerRows = {
  /** Appearances in FINAL matches. */
  games: number
  batting: { played: boolean; status: BattingStatus; runs: number; balls: number | null; fours: number | null; sixes: number | null }[]
  bowling: { played: boolean; balls: number; maidens: number; runs: number; wickets: number }[]
  /** CAUGHT dismissals fielded by the player plus caught-and-bowled by the bowler (derived from dismissals). */
  catches: number
}

export const emptyPlayerRows = (): PlayerRows => ({ games: 0, batting: [], bowling: [], catches: 0 })

export function aggregateFromMatchRows(rows: PlayerRows): SeasonCounts {
  const c: SeasonCounts = { ...EMPTY_COUNTS, games: rows.games, catches: rows.catches }
  for (const b of rows.batting) {
    if (!b.played || b.status === 'did_not_bat') continue
    const notOut = b.status === 'not_out'
    c.batInnings++
    if (notOut) c.batNotOuts++
    c.batRuns += b.runs
    c.batBalls += b.balls ?? 0
    c.batFours += b.fours ?? 0
    c.batSixes += b.sixes ?? 0
    if (b.runs > c.batHighScore || (b.runs === c.batHighScore && notOut)) {
      c.batHighScore = b.runs
      c.batHighScoreNotOut = notOut
    }
  }
  for (const b of rows.bowling) {
    if (!b.played) continue
    c.bowlBalls += b.balls
    c.bowlMaidens += b.maidens
    c.bowlRuns += b.runs
    c.bowlWickets += b.wickets
    if (b.wickets > c.bowlBestWickets || (b.wickets === c.bowlBestWickets && b.runs < c.bowlBestRuns)) {
      c.bowlBestWickets = b.wickets
      c.bowlBestRuns = b.runs
    }
  }
  return c
}

/** The rows of one match, as mapped or as read back from the database (children point at innings by sequence number). */
export type BundleRows = {
  match: MatchRow
  innings: InningsRow[]
  appearances: AppearanceRow[]
  batting: BattingRow[]
  bowling: BowlingRow[]
  fielding: FieldingRow[]
}

export type CollectedRows = {
  rows: Map<string, PlayerRows>
  /** Keys of players who share a display name with a club team-mate in at least one of their games. */
  sameName: Set<string>
}

/**
 * Groups the club team's rows by player key (one per resolved player, or per name key in tests).
 * `keyOf` returns null for a row that cannot be attributed (it is ignored). Only FINAL matches of
 * `teamId` count, like `aggregatePlayers`.
 */
export function collectPlayerRows(bundles: readonly BundleRows[], teamId: string, keyOf: (a: AppearanceRow) => string | null): CollectedRows {
  const rows = new Map<string, PlayerRows>()
  const sameName = new Set<string>()
  const get = (k: string) => {
    let r = rows.get(k)
    if (!r) rows.set(k, (r = emptyPlayerRows()))
    return r
  }
  for (const b of bundles) {
    if (b.match.status !== 'FINAL' || b.match.clubTeamId !== teamId) continue
    const inningsBySeq = new Map(b.innings.map((i) => [i.sequenceNo, i]))
    const keyByAppearance = new Map<string, string>()
    const seenNames = new Map<string, string>()
    for (const a of b.appearances) {
      if (!a.isClubSide || a.teamId !== teamId || !a.nameKey) continue
      const k = keyOf(a)
      if (k === null) continue
      keyByAppearance.set(a.appearanceId, k)
      get(k).games++
      const display = displayNameFromKey(a.nameKey).toLowerCase()
      if (seenNames.has(display)) {
        sameName.add(k)
        sameName.add(seenNames.get(display)!)
      } else seenNames.set(display, k)
    }
    for (const r of b.batting) {
      const inn = inningsBySeq.get(r.inningsSeq)
      if (!inn) continue
      const k = keyByAppearance.get(r.appearanceId)
      if (k !== undefined && inn.battingTeamId === teamId) {
        get(k).batting.push({ played: inn.played, status: r.battingStatus, runs: r.runs, balls: r.balls, fours: r.fours, sixes: r.sixes })
      }
      // Catches: dismissals of the other side's batters while the club bowls. A not-out row is never a dismissal.
      if (inn.bowlingTeamId === teamId && inn.played && r.battingStatus !== 'not_out' && r.battingStatus !== 'did_not_bat') {
        const fielder = r.dismissalType === 'caught' ? r.fielderAppearanceId : r.dismissalType === 'caught_and_bowled' ? r.bowlerAppearanceId : null
        const fk = fielder ? keyByAppearance.get(fielder) : undefined
        if (fk !== undefined) get(fk).catches++
      }
    }
    for (const r of b.bowling) {
      const inn = inningsBySeq.get(r.inningsSeq)
      const k = keyByAppearance.get(r.appearanceId)
      if (inn && k !== undefined && inn.bowlingTeamId === teamId) {
        get(k).bowling.push({ played: inn.played, balls: r.balls, maidens: r.maidens, runs: r.runs, wickets: r.wickets })
      }
    }
  }
  return { rows, sameName }
}

const FIELDS = Object.keys(EMPTY_COUNTS) as (keyof SeasonCounts)[]

export type CountMismatch = { key: string; field: keyof SeasonCounts; expected: number | boolean; derived: number | boolean }
export type ReconcileResult = { compared: number; mismatches: CountMismatch[]; catchesSkippedSameName: number }

/** Compares the season counts a sync planned with the counts derived from match rows, field by field (zero tolerance). */
export function compareCounts(expected: ReadonlyMap<string, SeasonCounts>, derived: CollectedRows): ReconcileResult {
  const mismatches: CountMismatch[] = []
  let catchesSkippedSameName = 0
  for (const [key, want] of expected) {
    const got = aggregateFromMatchRows(derived.rows.get(key) ?? emptyPlayerRows())
    const skipCatches = derived.sameName.has(key)
    if (skipCatches) catchesSkippedSameName++
    for (const f of FIELDS) {
      if (f === 'catches' && skipCatches) continue
      if (want[f] !== got[f]) mismatches.push({ key, field: f, expected: want[f], derived: got[f] })
    }
  }
  // A player who has match rows but no season row is a mismatch too (a game the season side never counted).
  for (const [key, r] of derived.rows) {
    if (!expected.has(key) && r.games > 0) mismatches.push({ key, field: 'games', expected: 0, derived: r.games })
  }
  return { compared: expected.size, mismatches, catchesSkippedSameName }
}
