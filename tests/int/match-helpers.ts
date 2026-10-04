import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { resetPlayers } from './players-helpers'

/** Empties the match store (children first) and the players tables it links to. */
export async function resetMatches(payload: Payload): Promise<void> {
  await payload.db.drizzle.execute(
    sql.raw(
      'TRUNCATE "payload"."match_batting", "payload"."match_bowling", "payload"."match_fielding", "payload"."match_innings", "payload"."match_appearances", "payload"."matches" RESTART IDENTITY CASCADE',
    ),
  )
  await resetPlayers(payload)
}
