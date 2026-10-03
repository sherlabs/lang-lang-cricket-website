/**
 * Sequences (spec §12.2 step 17). For every table that received explicit ids, the next id is
 * `GREATEST(MAX(id), legacy last_value) + 1`, so a new Payload row never reuses the id of a
 * deleted legacy row that an `llcc_rsvps` or `llcc_ann_dismissed` cookie may still hold.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { tableOf } from './timestamps'

/** Id-preserving collections and the legacy table whose sequence they continue. */
export const ID_PRESERVING: readonly { collection: string; legacyTable: string }[] = [
  { collection: 'documents', legacyTable: 'documents' },
  { collection: 'gallery-photos', legacyTable: 'gallery_photos' },
  { collection: 'sponsors', legacyTable: 'sponsors' },
  { collection: 'people', legacyTable: 'committee_contacts' },
  { collection: 'announcements', legacyTable: 'announcements' },
  { collection: 'events', legacyTable: 'events' },
  { collection: 'event-rsvps', legacyTable: 'event_rsvps' },
  { collection: 'event-photos', legacyTable: 'event_photos' },
  { collection: 'stories', legacyTable: 'stories' },
  { collection: 'players', legacyTable: 'players' },
  { collection: 'player-seasons', legacyTable: 'player_seasons' },
  { collection: 'player-sync-runs', legacyTable: 'player_sync_runs' },
]

export async function bumpSequence(payload: Payload, collection: string, legacyLastValue: number) {
  const t = `"payload"."${tableOf(collection)}"`
  await payload.db.drizzle.execute(
    sql.raw(
      `SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${t}), 0), ${Math.trunc(legacyLastValue)}) + 1, false)`,
    ),
  )
}

/** The next value `nextval` would return for a collection's id sequence (verify, tests). */
export async function nextSequenceValue(payload: Payload, collection: string): Promise<number> {
  const t = `"payload"."${tableOf(collection)}"`
  const seq = (await payload.db.drizzle.execute(sql.raw(`SELECT pg_get_serial_sequence('${t}', 'id') AS s`))) as { rows: { s: string }[] }
  const name = seq.rows[0]?.s
  if (!name) return 1
  const r = (await payload.db.drizzle.execute(sql.raw(`SELECT last_value, is_called FROM ${name}`))) as { rows: { last_value: string; is_called: boolean }[] }
  const row = r.rows[0]
  return row.is_called ? Number(row.last_value) + 1 : Number(row.last_value)
}
