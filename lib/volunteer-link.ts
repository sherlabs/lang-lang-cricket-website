import { createHmac, timingSafeEqual } from 'node:crypto'
import { deriveKey, HKDF_LABELS } from '@/lib/secrets'

/**
 * A volunteer's personal availability link (wave D spec 5.3). The token is `base64url(memberId) + '.' + base64url(HMAC)` where the
 * HMAC covers the member id and that member's `volunteerLinkVersion` under its own HKDF label. Nothing is stored: a database leak
 * does not reveal a link, staff can always show it again, and rotating (or archiving, or removing details) bumps the version so the
 * old address stops working. A token cannot be replayed for another member because the id is inside the MAC.
 */
const mac = (memberId: number, version: number, secret?: string): Buffer => createHmac('sha256', deriveKey(HKDF_LABELS.volLink, secret)).update(`m${memberId}v${version}`).digest()

export const volunteerToken = (memberId: number, version: number, secret?: string): string => `${Buffer.from(String(memberId)).toString('base64url')}.${mac(memberId, version, secret).toString('base64url')}`

/** The member id a token claims (not yet proven): the caller loads that member and then calls `volunteerTokenMatches`. */
export function claimedMemberId(token: string | null | undefined): number | null {
  if (!token || token.length > 120) return null
  const [id, sig, extra] = token.split('.')
  if (!id || !sig || extra !== undefined) return null
  const n = Number(Buffer.from(id, 'base64url').toString())
  return Number.isInteger(n) && n > 0 && n < 2_000_000_000 && Buffer.from(String(n)).toString('base64url') === id ? n : null
}

/** Constant-time check of a token against a member's current link version. */
export function volunteerTokenMatches(token: string | null | undefined, memberId: number, version: number, secret?: string): boolean {
  if (claimedMemberId(token) !== memberId || !token) return false
  const given = Buffer.from(token.split('.')[1] ?? '', 'base64url')
  const expected = mac(memberId, version, secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
