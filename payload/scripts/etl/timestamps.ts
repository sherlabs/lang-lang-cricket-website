/**
 * Timestamp post-pass (spec §12.2 step 16). The Local API stamps "now"; the sitemap, "latest
 * announcement" and the gallery OG image depend on the original values, so every step restores
 * `created_at`/`updated_at` of each row right after writing it. The per-table rules stay in the
 * steps (stories: `COALESCE(reviewed_at, published_at, created_at)`, WP4 findings; sync runs:
 * `startedAt`/`finishedAt`; events and the other tables without `updated_at`: `created_at`).
 * Microsecond legacy values truncate to milliseconds (`timestamptz(3)`).
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

/** Payload SQL table name for a collection slug (`gallery-photos` → `gallery_photos`). */
export const tableOf = (collection: string) => collection.replace(/-/g, '_')

export async function restoreTimestamps(payload: Payload, collection: string, id: number, createdAt: unknown, updatedAt?: unknown) {
  const created = createdAt instanceof Date ? createdAt : null
  if (!created) return
  const updated = updatedAt instanceof Date ? updatedAt : created
  await payload.db.drizzle.execute(
    sql`UPDATE ${sql.identifier('payload')}.${sql.identifier(tableOf(collection))}
        SET created_at = ${created.toISOString()}, updated_at = ${updated.toISOString()}
        WHERE id = ${id}`,
  )
}
