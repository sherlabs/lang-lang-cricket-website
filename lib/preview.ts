/** Pure validation for the staff preview route (`/preview/[collection]/[id]`). */
export const PREVIEW_COLLECTIONS = ['pages', 'news'] as const
export type PreviewCollection = (typeof PREVIEW_COLLECTIONS)[number]

/** `null` for any collection outside the whitelist or an id that is not plain digits. */
export function parsePreviewParams(collection: string, id: string): { collection: PreviewCollection; id: number } | null {
  if (!(PREVIEW_COLLECTIONS as readonly string[]).includes(collection)) return null
  if (!/^\d+$/.test(id)) return null
  const n = Number(id)
  return Number.isSafeInteger(n) && n > 0 ? { collection: collection as PreviewCollection, id: n } : null
}
