/**
 * Shared row-writing helpers for the ETL steps (spec §12.2, §12.3): id-preserving creates,
 * skip-or-update idempotency, the timestamp post-pass and sequence bumps.
 */
import type { CollectionSlug, Payload } from 'payload'
import { ETL_CONTEXT, type EtlContext } from './media'
import { restoreTimestamps } from './timestamps'

export { bumpSequence } from './sequences'
export { restoreTimestamps, tableOf } from './timestamps'

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
