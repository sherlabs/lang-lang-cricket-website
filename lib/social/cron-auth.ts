import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (v: string): Buffer => createHash('sha256').update(v).digest()

/**
 * Is this `Authorization` header the cron secret? An unset or empty secret never matches (so `Bearer undefined` cannot work);
 * both sides are hashed first, so the compared buffers always have equal length and the comparison cannot throw or leak length.
 */
export function cronAuthorized(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret) return false
  if (typeof header !== 'string') return false
  const m = /^Bearer (.+)$/.exec(header)
  if (!m) return false
  return timingSafeEqual(digest(m[1]), digest(secret))
}
