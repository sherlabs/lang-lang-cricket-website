/**
 * Drizzle access to the six match-store tables (WP-M, spec M2), the same pattern as
 * `lib/players/db.ts`: writes go through `payload.db.drizzle`, inside one transaction per game, and
 * bypass collection hooks on purpose (revalidation is explicit). Table keys are snake_case, COLUMN
 * keys are the camelCase field names (`match` is SQL `match_id`, `player` is `player_id`); every key
 * used is listed in `MATCH_COLUMN_KEYS` and asserted by `match-store.int`.
 */
import type { Payload } from 'payload'

// Payload types its drizzle tables as `any`; the column keys are checked at runtime (int test).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Table = any

export type MatchTables = {
  matches: Table
  match_innings: Table
  match_appearances: Table
  match_batting: Table
  match_bowling: Table
  match_fielding: Table
  player_aliases: Table
  players: Table
}

export function matchTables(payload: Payload): MatchTables {
  const { matches, match_innings, match_appearances, match_batting, match_bowling, match_fielding, player_aliases, players } = payload.db.tables as Record<string, Table>
  return { matches, match_innings, match_appearances, match_batting, match_bowling, match_fielding, player_aliases, players }
}

const stamps = ['createdAt', 'updatedAt'] as const

export const MATCH_COLUMN_KEYS: Record<keyof MatchTables, readonly string[]> = {
  matches: [
    'id', 'gameId', 'status', 'type', 'seasonName', 'seasonStartYear', 'competitionName', 'gradeId', 'gradeName', 'roundName', 'roundAbbr',
    'isFinalRound', 'startsAt', 'localDate', 'days', 'venueName', 'venueSuburb', 'clubTeamId', 'clubTeamName', 'opponentTeamId', 'opponentName',
    'opponentOrgId', 'opponentOrgName', 'isHome', 'tossWinnerTeamId', 'tossChoice', 'clubWonToss', 'clubOutcome', 'opponentOutcome', 'result',
    'byForfeit', 'onFirstInnings', 'playhqUpdatedAt', 'sourceHash', 'syncedAt', 'source', 'importBatch', ...stamps,
  ],
  match_innings: [
    'id', 'match', 'sequenceNo', 'periodName', 'battingTeamId', 'bowlingTeamId', 'isClubBatting', 'periodStatus', 'played', 'declared', 'allOut',
    'totalRuns', 'totalWickets', 'totalBalls', 'extrasTotal', 'wides', 'noBalls', 'byes', 'legByes', 'penalty', 'hasFallOfWickets',
    'hasBowlingData', 'hasBallData', ...stamps,
  ],
  match_appearances: [
    'id', 'match', 'appearanceId', 'teamId', 'isClubSide', 'player', 'nameKey', 'displayName', 'captainRole', 'isFillIn', 'isRegisteredPlayer',
    'playerNumber', ...stamps,
  ],
  match_batting: [
    'id', 'innings', 'match', 'appearanceId', 'position', 'battingStatus', 'runs', 'balls', 'fours', 'sixes', 'dismissalType',
    'bowlerAppearanceId', 'fielderAppearanceId', 'fowWicket', 'fowRuns', ...stamps,
  ],
  match_bowling: ['id', 'innings', 'match', 'appearanceId', 'order', 'balls', 'maidens', 'runs', 'wickets', 'wides', 'noBalls', ...stamps],
  match_fielding: ['id', 'innings', 'match', 'appearanceId', 'catches', 'keeperCatches', 'stumpings', 'runOutsAssisted', 'runOutsUnassisted', ...stamps],
  player_aliases: ['id', 'nameKey', 'player'],
  players: ['id', 'hidden', 'displayName', 'firstName', 'lastName'],
}

/** Schema the adapter is configured with (`payload.config.ts`); only raw SQL needs the literal. */
export const MATCH_SCHEMA = 'payload'
