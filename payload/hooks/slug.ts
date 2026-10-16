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
  (
    collection: CollectionSlug,
    titleField: string | ((data: Record<string, unknown>) => string) = 'title',
    reserved?: ReadonlySet<string>,
  ): FieldHook =>
  async ({ value, operation, originalDoc, data, req }) => {
    if (req.context?.etl) return value
    if (operation === 'create') {
      const d = (data ?? {}) as Record<string, unknown>
      const title = typeof titleField === 'function' ? titleField(d) : String(d[titleField] ?? '')
      return makeUniqueSlug(title, async (slug) => {
        const { totalDocs } = await req.payload.count({ collection, where: { slug: { equals: slug } }, overrideAccess: true, req })
        return totalDocs > 0
      }, reserved)
    }
    return (originalDoc as Record<string, unknown> | undefined)?.slug ?? value
  }

/**
 * Slug for collections whose slug an admin may edit on purpose (pages): same as `uniqueSlug` on
 * create (a REST-supplied value is already stripped by field access), but an update keeps what the
 * field access let through. A committee editor's update never carries the field, so the stored slug
 * stays; an admin's edit is validated by `slugValidator` and kept.
 */
export const editableSlug =
  (collection: CollectionSlug, reserved?: ReadonlySet<string>): FieldHook =>
  async (args) => {
    if (args.operation === 'create' || args.req.context?.etl) return uniqueSlug(collection, 'title', reserved)(args)
    const stored = (args.originalDoc as Record<string, unknown> | undefined)?.slug
    return typeof args.value === 'string' && args.value ? args.value : stored
  }
