import { createHmac, timingSafeEqual } from 'node:crypto'
import { AVAILABILITY, COOKIE_PREFIX } from '@/config/site'
import { deriveKey, HKDF_LABELS } from '@/lib/secrets'

/**
 * The club-wide availability link and the remembered-device cookie (announce-teams spec 4.5).
 *
 * The token is a derived secret, never stored: `base64url(HMAC-SHA256(hkdf('avail-link'), 'v' + linkVersion))`. A database leak
 * does not reveal it, the server can always show it again to selectors, and rotating is one increment of `linkVersion`, which
 * also kills every remembered device and every lock key (they all carry the version).
 */
export const linkToken = (linkVersion: number, secret?: string): string => createHmac('sha256', deriveKey(HKDF_LABELS.availLink, secret)).update(`v${linkVersion}`).digest('base64url')

/** Constant-time compare of a URL token with the current link's token. */
export function tokenMatches(given: string | null | undefined, linkVersion: number, secret?: string): boolean {
  if (!given || given.length !== 43) return false
  const a = Buffer.from(given)
  const b = Buffer.from(linkToken(linkVersion, secret))
  return a.length === b.length && timingSafeEqual(a, b)
}

export const AVAIL_COOKIE_MAX_AGE = AVAILABILITY.rememberDays * 24 * 60 * 60

export const availCookieName = (production: boolean = process.env.NODE_ENV === 'production'): string => `${production ? '__Host-' : ''}${COOKIE_PREFIX}_avail`

export function availCookieOptions(production: boolean = process.env.NODE_ENV === 'production') {
  return { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/', maxAge: AVAIL_COOKIE_MAX_AGE }
}

export type AvailCookie = { playerId: number; linkVersion: number; iat: number }

const mac = (value: string, secret?: string): Buffer => createHmac('sha256', deriveKey(HKDF_LABELS.availCookie, secret)).update(value).digest()

export function signAvailCookie(data: AvailCookie, secret?: string): string {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${body}.${mac(body, secret).toString('base64url')}`
}

/** The cookie's contents, or null when missing, malformed, tampered with or older than 90 days. The caller also checks `linkVersion` against the current one. */
export function verifyAvailCookie(raw: string | undefined | null, now: number = Date.now(), secret?: string): AvailCookie | null {
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
    const d = JSON.parse(Buffer.from(body, 'base64url').toString()) as Partial<AvailCookie>
    if (typeof d.playerId !== 'number' || typeof d.linkVersion !== 'number' || typeof d.iat !== 'number') return null
    const age = now - d.iat
    if (age < -60_000 || age > AVAIL_COOKIE_MAX_AGE * 1000) return null
    return { playerId: d.playerId, linkVersion: d.linkVersion, iat: d.iat }
  } catch {
    return null
  }
}

/** `Set-Cookie` for the remembered-device cookie; `null` clears it. */
export function serializeAvailCookie(value: string | null, production: boolean = process.env.NODE_ENV === 'production'): string {
  const o = availCookieOptions(production)
  const parts = [`${availCookieName(production)}=${value ?? ''}`, `Path=${o.path}`, `Max-Age=${value === null ? 0 : o.maxAge}`, 'HttpOnly', 'SameSite=Lax']
  if (o.secure) parts.push('Secure')
  if (value === null) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  return parts.join('; ')
}
