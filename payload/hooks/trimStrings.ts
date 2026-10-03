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

/** beforeValidate: trim each `players.honours` row's `years` and `title` (legacy trimmed both). Skipped under `context.etl`. */
export const trimHonours: CollectionBeforeValidateHook = ({ data, req }) => {
  if (!data || req.context?.etl || !Array.isArray(data.honours)) return data
  data.honours = data.honours.map((h: unknown) => {
    if (!h || typeof h !== 'object') return h
    const row = { ...(h as Record<string, unknown>) }
    for (const f of ['years', 'title']) if (typeof row[f] === 'string') row[f] = (row[f] as string).trim()
    return row
  })
  return data
}
