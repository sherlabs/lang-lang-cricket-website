import { createHmac, timingSafeEqual } from 'node:crypto'
import { COOKIE_PREFIX, FANTASY } from '@/config/site'
import { deriveKey, HKDF_LABELS } from '@/lib/secrets'

/**
 * The fantasy join link and the remembered-device cookie (wave F spec 4.4), the same pattern as the availability link. The token is
 * derived, never stored: `base64url(HMAC-SHA256(hkdf('fantasy-link'), 'v' + linkVersion))`. Rotating the link is one increment of
 * `linkVersion`, which also ends every remembered device and every lock key (they carry the version).
 */
export const fantasyToken = (linkVersion: number, secret?: string): string => createHmac('sha256', deriveKey(HKDF_LABELS.fantasyLink, secret)).update(`v${linkVersion}`).digest('base64url')

export function fantasyTokenMatches(given: string | null | undefined, linkVersion: number, secret?: string): boolean {
  if (!given || given.length !== 43) return false
  const a = Buffer.from(given)
  const b = Buffer.from(fantasyToken(linkVersion, secret))
  return a.length === b.length && timingSafeEqual(a, b)
}

export const FANTASY_COOKIE_MAX_AGE = FANTASY.rememberDays * 24 * 60 * 60
export const fantasyCookieName = (production: boolean = process.env.NODE_ENV === 'production'): string => `${production ? '__Host-' : ''}${COOKIE_PREFIX}_fantasy`
export function fantasyCookieOptions(production: boolean = process.env.NODE_ENV === 'production') {
  return { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/', maxAge: FANTASY_COOKIE_MAX_AGE }
}

/** Only the manager id, the link version and when it was issued. Nothing personal. */
export type FantasyCookie = { entryId: number; linkVersion: number; iat: number }

const mac = (value: string, secret?: string): Buffer => createHmac('sha256', deriveKey(HKDF_LABELS.fantasyCookie, secret)).update(value).digest()

export function signFantasyCookie(data: FantasyCookie, secret?: string): string {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${body}.${mac(body, secret).toString('base64url')}`
}

/** The cookie's contents, or null when missing, malformed, tampered with or older than 90 days. The caller also checks the link version, the entry and `pinSetAt`. */
export function verifyFantasyCookie(raw: string | undefined | null, now: number = Date.now(), secret?: string): FantasyCookie | null {
  if (!raw || raw.length > 600) return null
  const [body, sig, extra] = raw.split('.')
  if (!body || !sig || extra !== undefined) return null
  const expected = mac(body, secret)
  let given: Buffer
  try {
    given = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const d = JSON.parse(Buffer.from(body, 'base64url').toString()) as Partial<FantasyCookie>
    if (typeof d.entryId !== 'number' || typeof d.linkVersion !== 'number' || typeof d.iat !== 'number') return null
    const age = now - d.iat
    if (age < -60_000 || age > FANTASY_COOKIE_MAX_AGE * 1000) return null
    return { entryId: d.entryId, linkVersion: d.linkVersion, iat: d.iat }
  } catch {
    return null
  }
}

/** Is a verified cookie still good for this manager? Link version unchanged, entry live, and no PIN change after it was issued. */
export function cookieStillValid(c: FantasyCookie, entry: { disabled?: boolean | null; pinSetAt?: string | Date | null }, linkVersion: number): boolean {
  if (c.linkVersion !== linkVersion || entry.disabled) return false
  const pinSetAt = entry.pinSetAt ? new Date(entry.pinSetAt).getTime() : 0
  return pinSetAt <= c.iat
}
