import type { FieldHook } from 'payload'

/** `${firstName} ${lastName}`, trimmed — the same string the public pages show (`playerName`). */
export const fullName = (firstName: unknown, lastName: unknown) => `${String(firstName ?? '')} ${String(lastName ?? '')}`.trim()

/**
 * `players.displayName` field `beforeChange` (spec §3.12): always derived from the names, so
 * it is the list title and search field. A preferred name (W2 6.3, a nickname) wins over the full name; it is
 * display only and never touches identity (aliases, name keys, the slug). On update a partial `data` falls back
 * to the stored values. Sync and the ETL write it themselves (`context.sync`/`context.etl` keep the value).
 */
export const displayName: FieldHook = ({ value, data, originalDoc, req }) => {
  if (req.context?.etl || req.context?.sync) return value
  const d = (data ?? {}) as Record<string, unknown>
  const o = (originalDoc ?? {}) as Record<string, unknown>
  const preferred = 'preferredName' in d ? d.preferredName : o.preferredName
  return (typeof preferred === 'string' && preferred.trim()) || fullName(d.firstName ?? o.firstName, d.lastName ?? o.lastName)
}
