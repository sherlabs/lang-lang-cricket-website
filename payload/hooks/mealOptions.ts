import type { CollectionBeforeChangeHook } from 'payload'

type Row = { id?: string | null; label?: unknown }

/**
 * `beforeChange` on events (spec §3.8): normalise `mealOptions` the way `normaliseMealOptions`
 * does — trim, drop blanks, case-insensitive dedupe keeping the first spelling. Existing row
 * ids are kept. Runs before field validation, so blank rows never trip `label` required.
 * Skipped under `context.etl` (legacy lists, duplicates included, import verbatim).
 */
export const mealOptions: CollectionBeforeChangeHook = ({ data, req }) => {
  if (!data || req.context?.etl || !Array.isArray(data.mealOptions)) return data
  const seen = new Set<string>()
  const out: Row[] = []
  for (const row of data.mealOptions as Row[]) {
    const label = String(row?.label ?? '').trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...row, label })
  }
  data.mealOptions = out
  return data
}

