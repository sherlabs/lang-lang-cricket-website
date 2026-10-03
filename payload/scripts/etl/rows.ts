/**
 * Shared row-writing helpers for the ETL steps (spec §12.2, §12.3): id-preserving creates,
 * skip-or-update idempotency, the timestamp post-pass and sequence bumps.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { CollectionSlug, Payload } from 'payload'
import { ETL_CONTEXT, type EtlContext } from './media'

export async function existingById(payload: Payload, collection: CollectionSlug, id: number) {
  const { docs } = await payload.find({
    collection,
    where: { id: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  return (docs[0] as unknown as Record<string, unknown> | undefined) ?? null
}

/** Payload SQL table name for a collection slug (`gallery-photos` → `gallery_photos`). */
export const tableOf = (collection: string) => collection.replace(/-/g, '_')

/**
 * Timestamp post-pass for one row (spec §12.2 step 16): the Local API stamps "now", but the
 * sitemap, "latest announcement" and the gallery OG image depend on the original values.
 */
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

/**
 * Sequence bump (spec §12.2 step 17): next id = GREATEST(MAX(id), legacy last_value) + 1, so a
 * new Payload row never reuses the id of a deleted legacy row a cookie may still hold.
 */
export async function bumpSequence(payload: Payload, collection: string, legacyLastValue: number) {
  const t = `"payload"."${tableOf(collection)}"`
  await payload.db.drizzle.execute(
    sql.raw(
      `SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${t}), 0), ${Math.trunc(legacyLastValue)}) + 1, false)`,
    ),
  )
}

/**
 * Create a plain (non-upload) row with its legacy id, or skip / update it when it exists.
 * Returns what happened. Timestamps are restored on create and update.
 */
export async function upsertRow(
  ctx: EtlContext,
  opts: { step: string; collection: CollectionSlug; id: number; data: Record<string, unknown>; createdAt: unknown; updatedAt?: unknown },
): Promise<'created' | 'updated' | 'skipped' | 'planned'> {
  const { payload, dryRun, update, report } = ctx
  const counts = report.counts(opts.step)
  if (dryRun) {
    counts.planned++
    return 'planned'
  }
  const existing = await existingById(payload, opts.collection, opts.id)
  if (existing && !update) {
    counts.skipped++
    return 'skipped'
  }
  if (existing) {
    await payload.update({ collection: opts.collection, id: opts.id, data: opts.data, overrideAccess: true, depth: 0, context: { ...ETL_CONTEXT } })
    await restoreTimestamps(payload, opts.collection, opts.id, opts.createdAt, opts.updatedAt)
    counts.updated++
    return 'updated'
  }
  await payload.create({
    collection: opts.collection,
    data: { ...opts.data, id: opts.id } as never,
    overrideAccess: true,
    depth: 0,
    context: { ...ETL_CONTEXT },
  })
  await restoreTimestamps(payload, opts.collection, opts.id, opts.createdAt, opts.updatedAt)
  counts.created++
  return 'created'
}
