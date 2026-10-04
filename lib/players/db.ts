/**
 * Drizzle access to the Payload players tables (spec §8.1, D13). Bulk writes in sync and
 * merge go through `payload.db.drizzle` with these tables, inside its transactions, and
 * bypass collection hooks on purpose (revalidation is explicit).
 *
 * Table keys are snake_case; COLUMN keys are the camelCase field names (`nameKey`, `player`
 * for SQL `player_id`, `isActiveDerived`, `_parentID`/`_order` on the array table). A
 * snake_case column key is `undefined`, so every key used here is listed in
 * `PLAYER_COLUMN_KEYS` and asserted by `players-sync.int`.
 * Operators come from `@payloadcms/db-postgres/drizzle`, never the app-level `drizzle-orm`.
 */
import type { Payload } from 'payload'

// Payload types its drizzle tables as `any`; the column keys are checked at runtime (int test).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Table = any

export type PlayerTables = {
  players: Table
  player_aliases: Table
  player_seasons: Table
  player_sync_runs: Table
  players_honours: Table
  people: Table
  player_sponsors: Table
  match_appearances: Table
}

export function playerTables(payload: Payload): PlayerTables {
  const { players, player_aliases, player_seasons, player_sync_runs, players_honours, people, player_sponsors, match_appearances } = payload.db.tables as Record<string, Table>
  return { players, player_aliases, player_seasons, player_sync_runs, players_honours, people, player_sponsors, match_appearances }
}

/** Every column key `lib/players` and the merge endpoint read or write, per table. */
export const PLAYER_COLUMN_KEYS: Record<keyof PlayerTables, readonly string[]> = {
  players: ['id', 'slug', 'firstName', 'lastName', 'displayName', 'source', 'photo', 'bio', 'manualYears', 'isActiveDerived', 'hidden', 'createdAt', 'updatedAt'],
  player_aliases: ['id', 'nameKey', 'player', 'createdAt', 'updatedAt'],
  player_seasons: [
    'id', 'player', 'seasonName', 'seasonOrder', 'teamId', 'teamName', 'gradeName',
    'games', 'batInnings', 'batNotOuts', 'batRuns', 'batHighScore', 'batHighScoreNotOut', 'batBalls', 'batFours', 'batSixes', 'batRunsUnballed',
    'bowlBalls', 'bowlMaidens', 'bowlRuns', 'bowlWickets', 'bowlBestWickets', 'bowlBestRuns', 'catches', 'createdAt', 'updatedAt',
  ],
  player_sync_runs: [
    'id', 'startedAt', 'finishedAt', 'status', 'playersCreated', 'seasonRows', 'matchesUpserted', 'matchesSkipped', 'matchMismatches', 'matchError',
    'error', 'createdAt', 'updatedAt',
  ],
  players_honours: ['id', '_parentID', '_order', 'years', 'title'],
  people: ['id', 'player', 'updatedAt'],
  player_sponsors: ['id', 'player', 'updatedAt'],
  match_appearances: ['id', 'player', 'updatedAt'],
}

export const chunk = <T,>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
