import type { CollectionBeforeDeleteHook, CollectionSlug } from 'payload'

/**
 * `beforeDelete` (spec §3.8, `cascadeDelete.ts`): delete the children that reference the doc
 * through `field`, through the Local API with the same `req`, so they share the parent's
 * transaction. Upload children (event photos) go through the storage plugin's afterDelete,
 * which removes their blobs (subject to `guardLegacyBlobDeletes`).
 */
export const cascadeDelete =
  (children: readonly { collection: CollectionSlug; field: string }[]): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    for (const child of children) {
      await req.payload.delete({
        collection: child.collection,
        where: { [child.field]: { equals: id } },
        overrideAccess: true,
        depth: 0,
        req,
      })
    }
  }
