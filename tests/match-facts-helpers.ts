import type { StoredBundle } from '@/lib/match-store/read'
import type { BattingRow, BowlingRow, DismissalType, FieldingRow, InningsRow, MatchRow } from '@/lib/playhq/match-rows'

/**
 * Tiny hand-built stored matches for the W2 stats unit tests. Club people are `c1`, `c2`, ... (player
 * ids 101, 102, ...); opposition people are `o1`, ... (no player link). Nothing here is real data.
 */
export type BatSpec = {
  who: string; pos: number; status?: 'out' | 'not_out' | 'unknown' | 'did_not_bat'; runs?: number
  balls?: number | null; fours?: number | null; sixes?: number | null
  dismissal?: DismissalType | null; bowler?: string; fielder?: string; fow?: [number, number]
}
export type BowlSpec = { who: string; order?: number; balls?: number; maidens?: number; runs?: number; wickets?: number }
export type FieldSpec = { who: string; catches?: number; keeper?: number; stumpings?: number; roAssisted?: number; roUnassisted?: number }
export type InningsSpec = {
  seq: number; clubBatting: boolean; played?: boolean; hasFow?: boolean; hasBowling?: boolean; hasBall?: boolean
  allOut?: boolean; declared?: boolean; runs?: number; wickets?: number
  bat?: BatSpec[]; bowl?: BowlSpec[]; field?: FieldSpec[]
}
export type BundleSpec = {
  id?: number; gameId?: string; status?: string; result?: MatchRow['result']; forfeit?: boolean; firstInnings?: boolean
  date?: string; season?: number; grade?: string; team?: string; type?: string
  orgId?: string | null; orgName?: string | null; oppName?: string | null
  innings?: InningsSpec[]
  /** Extra club players who appear without batting or bowling. */
  extra?: string[]
}

export const playerId = (who: string) => 100 + Number(who.slice(1))

export function mkBundle(s: BundleSpec = {}): StoredBundle {
  const innings = s.innings ?? []
  const whos = new Set<string>(s.extra ?? [])
  for (const i of innings) {
    for (const b of i.bat ?? []) { whos.add(b.who); if (b.bowler) whos.add(b.bowler); if (b.fielder) whos.add(b.fielder) }
    for (const b of i.bowl ?? []) whos.add(b.who)
    for (const f of i.field ?? []) whos.add(f.who)
  }
  const match: MatchRow = {
    gameId: s.gameId ?? 'g1', status: s.status ?? 'FINAL', type: s.type ?? 'oneDay', seasonName: `Summer ${s.season ?? 2025}/${String((s.season ?? 2025) + 1).slice(2)}`,
    seasonStartYear: s.season ?? 2025, competitionName: 'Test Comp', gradeId: 'gr1', gradeName: s.grade ?? 'Test Grade', roundName: 'R1', roundAbbr: 'R1', isFinalRound: false,
    startsAt: null, localDate: s.date ?? '2025-10-11', days: 1, venueName: null, venueSuburb: null, clubTeamId: 'ct', clubTeamName: s.team ?? 'Test A', opponentTeamId: 'ot',
    opponentName: s.oppName === undefined ? 'Rivals A' : s.oppName, opponentOrgId: s.orgId === undefined ? 'org-rivals' : s.orgId, opponentOrgName: s.orgName === undefined ? 'Rivals' : s.orgName,
    isHome: true, tossWinnerTeamId: null, tossChoice: null, clubWonToss: null, clubOutcome: null, opponentOutcome: null, result: s.result === undefined ? 'won' : s.result,
    byForfeit: s.forfeit ?? false, onFirstInnings: s.firstInnings ?? false, playhqUpdatedAt: null,
  }
  const inn: InningsRow[] = innings.map((i) => ({
    sequenceNo: i.seq, periodName: null, battingTeamId: i.clubBatting ? 'ct' : 'ot', bowlingTeamId: i.clubBatting ? 'ot' : 'ct', isClubBatting: i.clubBatting, periodStatus: null,
    played: i.played ?? true, declared: i.declared ?? false, allOut: i.allOut ?? false, totalRuns: i.runs ?? 0, totalWickets: i.wickets ?? 0, totalBalls: 0,
    extrasTotal: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0,
    hasFallOfWickets: i.hasFow ?? false, hasBowlingData: i.hasBowling ?? true, hasBallData: i.hasBall ?? true,
  }))
  const batting: BattingRow[] = innings.flatMap((i) => (i.bat ?? []).map((b) => ({
    inningsSeq: i.seq, appearanceId: b.who, position: b.pos, battingStatus: b.status ?? 'out', runs: b.runs ?? 0,
    balls: b.balls === undefined ? 10 : b.balls, fours: b.fours === undefined ? 1 : b.fours, sixes: b.sixes === undefined ? 0 : b.sixes,
    dismissalType: b.dismissal ?? null, bowlerAppearanceId: b.bowler ?? null, fielderAppearanceId: b.fielder ?? null,
    fowWicket: b.fow ? b.fow[0] : null, fowRuns: b.fow ? b.fow[1] : null,
  })))
  const bowling: BowlingRow[] = innings.flatMap((i) => (i.bowl ?? []).map((b, k) => ({
    inningsSeq: i.seq, appearanceId: b.who, order: b.order ?? k + 1, balls: b.balls ?? 24, maidens: b.maidens ?? 0, runs: b.runs ?? 20, wickets: b.wickets ?? 0, wides: 0, noBalls: 0,
  })))
  const fielding: FieldingRow[] = innings.flatMap((i) => (i.field ?? []).map((f) => ({
    inningsSeq: i.seq, appearanceId: f.who, catches: f.catches ?? 0, keeperCatches: f.keeper ?? 0, stumpings: f.stumpings ?? 0, runOutsAssisted: f.roAssisted ?? 0, runOutsUnassisted: f.roUnassisted ?? 0,
  })))
  return {
    id: s.id ?? 1, match, innings: inn, batting, bowling, fielding,
    appearances: [...whos].map((w) => ({
      appearanceId: w, teamId: w.startsWith('c') ? 'ct' : 'ot', isClubSide: w.startsWith('c'), nameKey: w.startsWith('c') ? `club|${w}` : null,
      displayName: w.startsWith('c') ? null : `Opp ${w}`, captainRole: null, isFillIn: false, isRegisteredPlayer: true, playerNumber: null, player: w.startsWith('c') ? playerId(w) : null,
    })),
  }
}

export const visible = (...whos: string[]) => new Set(whos.map(playerId))
export const everyone = new Set(Array.from({ length: 30 }, (_, i) => 101 + i))
