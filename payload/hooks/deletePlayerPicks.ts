import { sql } from '@payloadcms/db-postgres/drizzle'
import type { CollectionBeforeDeleteHook } from 'payload'

/**
 * `beforeDelete` for players: remove the best-player picks that name the player. The pick rows
 * are an array field of the ballots, and `best_player_ballots_picks.player_id` is NOT NULL, so the
 * FK's SET NULL would otherwise fail the delete with a NOT NULL violation. The rest of each
 * ballot stays; the tally simply has one pick fewer.
 */
export const deletePlayerPicks: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.db.drizzle.execute(sql`DELETE FROM "payload"."best_player_ballots_picks" WHERE "player_id" = ${Number(id)}`)
}
