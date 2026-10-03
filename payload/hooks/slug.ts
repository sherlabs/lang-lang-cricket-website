import type { CollectionSlug, FieldHook } from 'payload'
import { makeUniqueSlug } from '../../lib/slugify'

/**
 * Slug field hook (spec §3 conventions, §3.11). A `beforeChange` field hook, so it runs after
 * field access has stripped any REST-supplied value (`access: { create/update: nobody }`):
 * - create: `makeUniqueSlug(slugify(title))`, with the reserved `submit`/`drafts` and `-2`,
 *   `-3`… on collision (checked against the collection inside the same request/transaction);
 * - update: always the stored slug, so URLs never change when the title is edited;
 * - `context.etl`: keep the supplied slug verbatim.
 */
export const uniqueSlug =
  (collection: CollectionSlug, titleField = 'title'): FieldHook =>
  async ({ value, operation, originalDoc, data, req }) => {
    if (req.context?.etl) return value
    if (operation === 'create') {
      const title = String((data as Record<string, unknown> | undefined)?.[titleField] ?? '')
      return makeUniqueSlug(title, async (slug) => {
        const { totalDocs } = await req.payload.count({ collection, where: { slug: { equals: slug } }, overrideAccess: true, req })
        return totalDocs > 0
      })
    }
    return (originalDoc as Record<string, unknown> | undefined)?.slug ?? value
  }
