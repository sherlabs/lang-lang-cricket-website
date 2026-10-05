/**
 * The optional button on an announcement links to a page on this site (`/teams`) or to an `https:` address. Anything else is
 * refused: `javascript:`, `data:`, protocol-relative `//host`, backslash tricks and control characters (announce-teams spec 2).
 */
export function isSafeAnnouncementLink(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v || v.length > 500) return false
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return false
  if (v.startsWith('/')) return !v.startsWith('//')
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && u.hostname !== ''
  } catch {
    return false
  }
}

/** A Payload `validate` function: empty is fine (no button). */
export const validateAnnouncementLink = (value: unknown): true | string =>
  value == null || value === '' || isSafeAnnouncementLink(value) ? true : 'Use a page on this site (starting with /) or a link starting with https://'
