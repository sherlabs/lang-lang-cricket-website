import type { CollectionBeforeChangeHook } from 'payload'

/** beforeChange: trim the named string fields (people, ports the old `fromForm`). Skipped under `context.etl`. */
export const trimStrings =
  (fields: readonly string[]): CollectionBeforeChangeHook =>
  ({ data, req }) => {
    if (req.context?.etl) return data
    for (const f of fields) {
      if (typeof data?.[f] === 'string') data[f] = data[f].trim()
    }
    return data
  }
