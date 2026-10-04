import { createHash } from 'node:crypto'
import type { BattingRow, BowlingRow, MatchBundle } from '@/lib/playhq/match-rows'
import type { ImportedGame } from './match-rows'

/** Maps one imported game to the rows of the match store (the same shape the PlayHQ mapper produces). Pure. */
export const IMPORT_OPPONENT_TEAM_ID = 'import:opposition'

export function buildImportedBundle(g: ImportedGame): MatchBundle {
  const clubTeamId = `import:${g.teamSlug}`
  const hasBowling = g.players.some((p) => (p.bowlBalls ?? 0) > 0)
  const batters = g.players.filter((p) => p.batted !== null)

  const outcome = (r: ImportedGame['result']) => (r === 'won' ? 'WON' : r === 'lost' ? 'LOST' : r === 'draw' ? 'DRAW' : r === 'tie' ? 'TIE' : null)
  const flip = (r: ImportedGame['result']) => (r === 'won' ? 'lost' : r === 'lost' ? 'won' : r)

  const appearances = g.players.map((p, i) => ({
    appearanceId: `i${i + 1}`, teamId: clubTeamId, isClubSide: true, nameKey: p.nameKey, displayName: null,
    captainRole: null, isFillIn: false, isRegisteredPlayer: true, playerNumber: null,
  }))
  const idOf = new Map(g.players.map((p, i) => [p.row, `i${i + 1}`]))

  const batting: BattingRow[] = batters.map((p) => {
    const dnb = p.batted === false
    const notOut = p.howOut === 'not_out'
    const status: BattingRow['battingStatus'] = dnb ? 'did_not_bat' : notOut ? 'not_out' : p.howOut ? 'out' : 'unknown'
    return {
      inningsSeq: 1, appearanceId: idOf.get(p.row)!,
      // The scorebook order is not in the file: 0 is "no data" for every batting-position figure.
      position: 0, battingStatus: status, runs: dnb ? 0 : (p.runs ?? 0),
      balls: dnb ? null : p.balls, fours: dnb ? null : p.fours, sixes: dnb ? null : p.sixes,
      dismissalType: status === 'out' ? (p.howOut as BattingRow['dismissalType']) : null,
      bowlerAppearanceId: null, fielderAppearanceId: null, fowWicket: null, fowRuns: null,
    }
  })
  const bowling: BowlingRow[] = g.players
    .filter((p) => (p.bowlBalls ?? 0) > 0)
    .map((p, order) => ({
      inningsSeq: 2, appearanceId: idOf.get(p.row)!, order: order + 1, balls: p.bowlBalls ?? 0, maidens: p.maidens ?? 0, runs: p.runsConceded ?? 0,
      wickets: p.wickets ?? 0, wides: 0, noBalls: 0,
    }))

  const total = (v: number | null) => v as unknown as number // stored as NULL when the file gives no total (the column is nullable)
  const innings: MatchBundle['innings'] = [
    {
      sequenceNo: 1, periodName: '1st innings', battingTeamId: clubTeamId, bowlingTeamId: IMPORT_OPPONENT_TEAM_ID, isClubBatting: true, periodStatus: 'FINAL',
      played: batters.length > 0 || g.teamRuns !== null, declared: false, allOut: g.teamWickets === 10,
      totalRuns: total(g.teamRuns), totalWickets: total(g.teamWickets), totalBalls: total(null),
      extrasTotal: total(null), wides: total(null), noBalls: total(null), byes: total(null), legByes: total(null), penalty: total(null),
      hasFallOfWickets: false, hasBowlingData: false, hasBallData: false,
    },
    {
      sequenceNo: 2, periodName: '2nd innings', battingTeamId: IMPORT_OPPONENT_TEAM_ID, bowlingTeamId: clubTeamId, isClubBatting: false, periodStatus: 'FINAL',
      played: g.oppRuns !== null || hasBowling, declared: false, allOut: g.oppWickets === 10,
      totalRuns: total(g.oppRuns), totalWickets: total(g.oppWickets), totalBalls: total(null),
      extrasTotal: total(null), wides: total(null), noBalls: total(null), byes: total(null), legByes: total(null), penalty: total(null),
      // Bowling figures are given for the club's bowlers, so the discipline is recorded; ball-by-ball detail and fall of wickets never are.
      hasFallOfWickets: false, hasBowlingData: hasBowling, hasBallData: false,
    },
  ]

  const match: MatchBundle['match'] = {
    gameId: g.gameId, status: 'FINAL', type: g.format === 'one_day' ? 'oneDay' : g.format === 'two_day' ? 'twoDay' : '',
    seasonName: g.seasonName, seasonStartYear: g.seasonStartYear, competitionName: '',
    gradeId: null, gradeName: g.gradeName, roundName: g.gameRef, // the club's own reference for the game (kept so an export re-imports as the same game)
     roundAbbr: null, isFinalRound: false,
    startsAt: `${g.date}T12:00:00.000Z`, localDate: g.date, days: g.format === 'two_day' ? 2 : 1, venueName: null, venueSuburb: null,
    clubTeamId, clubTeamName: g.teamName, opponentTeamId: null, opponentName: g.opponent, opponentOrgId: null, opponentOrgName: null,
    isHome: false, tossWinnerTeamId: null, tossChoice: null, clubWonToss: null,
    clubOutcome: outcome(g.result), opponentOutcome: outcome(flip(g.result)), result: g.result, byForfeit: false, onFirstInnings: false, playhqUpdatedAt: null,
  }
  const body = { match, innings, appearances, batting, bowling }
  const sourceHash = createHash('sha1').update(JSON.stringify(body)).digest('hex')
  return { ...body, fielding: [], sourceHash, warnings: [] }
}
