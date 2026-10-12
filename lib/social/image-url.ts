import { createHmac, timingSafeEqual } from 'node:crypto'
import { SOCIAL_IMAGE_GRACE_MINUTES, SOCIAL_IMAGE_URL_HOURS } from '@/config/site'
import { deriveKey, HKDF_LABELS } from '@/lib/secrets'
import { isSizeKey, type SizeKey } from './types'

/**
 * The signed picture link a network fetches (wave C spec 4.7): `/api/social/image/<post>/<size>?rev=&exp=&sig=`. The signature covers
 * the post id, size, revision and expiry, and is checked BEFORE any database lookup, so there is no timing oracle on post ids. An
 * edit bumps the revision, which kills old links.
 */
export type ImageClaims = { postId: number; size: SizeKey; revision: number; exp: number }

const message = (c: ImageClaims): string => `${c.postId}.${c.size}.${c.revision}.${c.exp}`
const sign = (c: ImageClaims, secret?: string): string => createHmac('sha256', deriveKey(HKDF_LABELS.socialImage, secret)).update(message(c)).digest('hex')

export function imagePath(c: ImageClaims, secret?: string): string {
  return `/api/social/image/${c.postId}/${c.size}?rev=${c.revision}&exp=${c.exp}&sig=${sign(c, secret)}`
}

/** A link valid until `now + hours` (never more than 24 hours). `base` is the club's own site URL, never a request header. */
export function mintImageUrl(base: string, o: { postId: number; size: SizeKey; revision: number; now?: Date; hours?: number }, secret?: string): string {
  const hours = Math.min(o.hours ?? SOCIAL_IMAGE_URL_HOURS, SOCIAL_IMAGE_URL_HOURS)
  const exp = Math.floor(((o.now ?? new Date()).getTime() + hours * 3_600_000) / 1000)
  return `${base.replace(/\/$/, '')}${imagePath({ postId: o.postId, size: o.size, revision: o.revision, exp }, secret)}`
}

export type RawImageRequest = { postId: string; size: string; rev: string | null; exp: string | null; sig: string | null }

/** Verifies the claims in a request. Pure: no database, so it can be called with a throwing stub. Null for anything wrong. */
export function verifyImageRequest(r: RawImageRequest, now: Date = new Date(), secret?: string): ImageClaims | null {
  if (!/^\d{1,12}$/.test(r.postId) || !isSizeKey(r.size) || !r.rev || !/^\d{1,9}$/.test(r.rev) || !r.exp || !/^\d{1,12}$/.test(r.exp)) return null
  if (!r.sig || !/^[0-9a-f]{64}$/.test(r.sig)) return null
  const claims: ImageClaims = { postId: Number(r.postId), size: r.size, revision: Number(r.rev), exp: Number(r.exp) }
  if (claims.exp * 1000 <= now.getTime()) return null
  if (claims.exp * 1000 > now.getTime() + (SOCIAL_IMAGE_URL_HOURS + 1) * 3_600_000) return null
  const expected = Buffer.from(sign(claims, secret), 'hex')
  const given = Buffer.from(r.sig, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected) ? claims : null
}

/**
 * May this post's picture be served now? While scheduled or publishing, yes. After it finishes (`published` or `failed`), only for
 * the grace period, so a network's picture fetch cannot lose a race with the flip to published.
 */
export function imageServable(post: { status: string; revision: number; finishedAt: Date | null }, claims: ImageClaims, now: Date = new Date()): boolean {
  if (post.revision !== claims.revision) return false
  if (post.status === 'scheduled' || post.status === 'publishing') return true
  if ((post.status === 'published' || post.status === 'failed') && post.finishedAt) return now.getTime() - post.finishedAt.getTime() <= SOCIAL_IMAGE_GRACE_MINUTES * 60_000
  return false
}
