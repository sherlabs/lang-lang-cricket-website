import type { CollectionBeforeOperationHook, CollectionSlug } from 'payload'

/**
 * `sortFirst` (spec §3.4, gallery-photos and event-photos): on create, when `sortOrder` is
 * not supplied, set it to `min(sortOrder) - 1`, so new uploads land at the front without
 * rewriting every row. Runs in `beforeOperation`, before field defaults are applied; the
 * field must have no `defaultValue` (`sortOrderField(…, { withDefault: false })`), or the
 * admin form would submit it and the hook would treat it as chosen.
 * Skipped under `context.etl` (the ETL supplies sortOrder).
 */
export const sortFirst: CollectionBeforeOperationHook = async ({ args, collection, operation, req }) => {
  if (operation !== 'create' || req.context?.etl) return args
  const data = (args.data ?? {}) as Record<string, unknown>
  const supplied = data.sortOrder
  if (supplied !== undefined && supplied !== null && supplied !== '') return args
  const first = await req.payload.find({
    collection: collection.slug as CollectionSlug,
    sort: 'sortOrder',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const min = (first.docs[0] as { sortOrder?: number } | undefined)?.sortOrder
  args.data = { ...data, sortOrder: typeof min === 'number' ? min - 1 : 0 } as typeof args.data
  return args
}
