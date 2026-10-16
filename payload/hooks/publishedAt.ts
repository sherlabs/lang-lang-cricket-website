import type { CollectionBeforeValidateHook } from 'payload'

/**
 * Stamps `publishedAt` the first time a document is published, if the editor left it empty (an
 * editor-chosen date, including a future one for scheduling, is kept). Runs before validation so a
 * "required when published" rule on the field sees the value. Skipped under `context.etl`.
 */
export const stampPublishedAt: CollectionBeforeValidateHook = ({ data, originalDoc, req }) => {
  if (!data || req.context?.etl) return data
  const status = data.status ?? (originalDoc as { status?: string } | undefined)?.status
  if (status !== 'published') return data
  // A value in the submitted data wins, even an emptied one (then it is stamped now); otherwise keep the stored date.
  const has = 'publishedAt' in data ? data.publishedAt : (originalDoc as { publishedAt?: string | null } | undefined)?.publishedAt
  if (!has) data.publishedAt = new Date().toISOString()
  return data
}
