import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

/**
 * Empties the players tables with SQL: a Local API delete would hit the PlayHQ delete guard.
 * Restarting the identities keeps ids small and predictable per file.
 */
export async function resetPlayers(payload: Payload): Promise<void> {
  await payload.db.drizzle.execute(
    sql.raw(
      'TRUNCATE "payload"."player_seasons", "payload"."player_aliases", "payload"."players_honours", "payload"."players", "payload"."player_sync_runs" RESTART IDENTITY CASCADE',
    ),
  )
}
