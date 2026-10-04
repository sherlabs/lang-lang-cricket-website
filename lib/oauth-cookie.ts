import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { COOKIE_PREFIX } from '@/config/site'
import { deriveKey, HKDF_LABELS } from './secrets'

/**
 * The single-use cookie that carries the OAuth round trip (spec 3.5): `{ nonce, next, invite?, userId?, iat }`, HMAC-signed with
 * a key derived from PAYLOAD_SECRET (label `selector-oauth`). The `state` sent to Facebook is derived from the nonce, which lives
 * ONLY in this cookie, so a returned state must correspond to the cookie in the same browser. In production the name carries the
 * `__Host-` prefix, which forces Secure, Path=/ and no Domain: that (not the signature) stops a sibling subdomain planting a cookie.
 */
export const OAUTH_COOKIE_MAX_AGE = 600

export type OAuthCookie = { nonce: string; next: string; invite?: string; userId?: number; iat: number }

export const oauthCookieName = (production: boolean = process.env.NODE_ENV === 'production'): string => `${production ? '__Host-' : ''}${COOKIE_PREFIX}_sel_oauth`

export function oauthCookieOptions(production: boolean = process.env.NODE_ENV === 'production') {
  return { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/', maxAge: OAUTH_COOKIE_MAX_AGE }
}

const mac = (value: string, secret?: string): Buffer => createHmac('sha256', deriveKey(HKDF_LABELS.oauth, secret)).update(value).digest()

/** The `state` value for a nonce. */
export const stateFor = (nonce: string, secret?: string): string => createHmac('sha256', deriveKey(HKDF_LABELS.oauth, secret)).update(`state:${nonce}`).digest('base64url')

export const newNonce = (): string => randomBytes(32).toString('base64url')

export function signOAuthCookie(data: OAuthCookie, secret?: string): string {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${body}.${mac(body, secret).toString('base64url')}`
}

/** The cookie's contents, or null when it is missing, malformed, tampered with, from another key, or older than 10 minutes. */
export function verifyOAuthCookie(raw: string | undefined | null, now: number = Date.now(), secret?: string): OAuthCookie | null {
  if (!raw || raw.length > 2000) return null
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
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as Partial<OAuthCookie>
    if (typeof data.nonce !== 'string' || typeof data.next !== 'string' || typeof data.iat !== 'number') return null
    const age = now - data.iat
    if (age < -60_000 || age > OAUTH_COOKIE_MAX_AGE * 1000) return null
    return { nonce: data.nonce, next: data.next, iat: data.iat, ...(typeof data.invite === 'string' ? { invite: data.invite } : {}), ...(typeof data.userId === 'number' ? { userId: data.userId } : {}) }
  } catch {
    return null
  }
}

/** Constant-time check that the returned `state` is the one derived from the cookie's nonce. */
export function stateMatches(cookie: OAuthCookie, state: string | null | undefined, secret?: string): boolean {
  if (!state) return false
  const a = Buffer.from(stateFor(cookie.nonce, secret))
  const b = Buffer.from(state)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** `Set-Cookie` for the OAuth cookie, and the matching expiry that clears it (same attributes, so the browser replaces it). */
export function serializeOAuthCookie(value: string | null, production: boolean = process.env.NODE_ENV === 'production'): string {
  const o = oauthCookieOptions(production)
  const parts = [`${oauthCookieName(production)}=${value ?? ''}`, `Path=${o.path}`, `Max-Age=${value === null ? 0 : o.maxAge}`, 'HttpOnly', 'SameSite=Lax']
  if (o.secure) parts.push('Secure')
  if (value === null) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  return parts.join('; ')
}

/** One cookie value from a `Cookie` request header. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}
