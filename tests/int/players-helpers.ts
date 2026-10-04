import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

/**
 * Empties the players tables (and the match store) with SQL: a Local API delete would hit the PlayHQ delete guard.
 * Restarting the identities keeps ids small and predictable per file.
 */
export async function resetPlayers(payload: Payload): Promise<void> {
  await payload.db.drizzle.execute(
    sql.raw(
      'TRUNCATE "payload"."player_seasons", "payload"."player_aliases", "payload"."players_honours", "payload"."players", "payload"."player_sync_runs", ' +
        // The match store links to players, so it goes too (a kept `matches` row would make the next write look unchanged).
        '"payload"."match_batting", "payload"."match_bowling", "payload"."match_fielding", "payload"."match_innings", "payload"."match_appearances", "payload"."matches" RESTART IDENTITY CASCADE',
    ),
  )
}
