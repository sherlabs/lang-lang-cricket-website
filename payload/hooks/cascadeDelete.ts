import { APIError, type CollectionBeforeDeleteHook, type CollectionSlug } from 'payload'

/**
 * `beforeDelete` (spec §3.8, `cascadeDelete.ts`): delete the children that reference the doc
 * through `field`, through the Local API with the same `req`, so they share the parent's
 * transaction. Upload children (event photos) go through the storage plugin's afterDelete,
 * which removes their blobs (subject to `guardLegacyBlobDeletes`). Any child that fails to
 * delete aborts the parent delete with that child's error.
 */
export const cascadeDelete =
  (children: readonly { collection: CollectionSlug; field: string }[]): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    for (const child of children) {
      const result = await req.payload.delete({
        collection: child.collection,
        where: { [child.field]: { equals: id } },
        overrideAccess: true,
        depth: 0,
        req,
      })
      // A delete by `where` reports per-document failures instead of throwing. Surface them, or
      // the parent delete carries on into a NOT NULL violation on the child's `event_id`.
      if (result.errors.length > 0) {
        throw new APIError(`Could not delete ${child.collection}: ${result.errors.map((e) => e.message).join('; ')}`, 500)
      }
    }
  }
