import { createHmac, timingSafeEqual } from 'node:crypto'
import { deriveKey, HKDF_LABELS } from '@/lib/secrets'

/**
 * Unsubscribe tokens and address hashes (wave D spec 9.2 and 9.4). Both use the `emailUnsub` HKDF key with different message
 * prefixes, so a hash can never be used as a token signature or the other way round.
 *
 * `token = base64url(recipientId) + '.' + base64url(HMAC)`. No expiry: the link has to keep working long after the send.
 * `emailHash = HMAC(lowercased address)`, the key every send-time suppression check uses; it survives purging an address.
 */
const key = (secret?: string): Buffer => deriveKey(HKDF_LABELS.emailUnsub, secret)

export const normaliseAddress = (email: string): string => email.trim().toLowerCase()

export const emailHash = (email: string, secret?: string): string => createHmac('sha256', key(secret)).update(`addr:${normaliseAddress(email)}`).digest('hex')

const mac = (recipientId: number, secret?: string): Buffer => createHmac('sha256', key(secret)).update(`rcpt:${recipientId}`).digest()

export const unsubToken = (recipientId: number, secret?: string): string => `${Buffer.from(String(recipientId)).toString('base64url')}.${mac(recipientId, secret).toString('base64url')}`

/** The recipient id a token proves, or null. Constant-time on the signature; shape checked first so nothing odd reaches the compare. */
export function verifyUnsubToken(token: string | null | undefined, secret?: string): number | null {
  if (!token || token.length > 120) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const id = Number(Buffer.from(parts[0], 'base64url').toString())
  if (!Number.isInteger(id) || id < 1 || id > 2_000_000_000 || Buffer.from(String(id)).toString('base64url') !== parts[0]) return null
  const given = Buffer.from(parts[1], 'base64url')
  const expected = mac(id, secret)
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null
}

/** `j***@example.com`: enough for a person to recognise their address, not enough to read it from a shared screen. */
export function maskAddress(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null
  const [local, domain] = [email.slice(0, email.lastIndexOf('@')), email.slice(email.lastIndexOf('@') + 1)]
  return `${local.slice(0, 1)}***@${domain}`
}
