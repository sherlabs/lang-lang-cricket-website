import type { CollectionBeforeValidateHook } from 'payload'

/**
 * beforeValidate: trim the named string fields (ports the old `fromForm`/`clean()`), so a
 * whitespace-only required value fails `required` instead of being saved as ''. Skipped
 * under `context.etl` (legacy values are copied verbatim).
 */
export const trimStrings =
  (fields: readonly string[]): CollectionBeforeValidateHook =>
  ({ data, req }) => {
    if (!data || req.context?.etl) return data
    for (const f of fields) {
      if (typeof data[f] === 'string') data[f] = data[f].trim()
    }
    return data
  }
