import { createHmac } from 'node:crypto'
import { FANTASY } from '@/config/site'
import { deriveKey, HKDF_LABELS } from '@/lib/secrets'
import type { ThrottleRule } from '@/lib/throttle'

/**
 * Throttle keys and rules for signing in to the fantasy game (wave F spec 4.4). Pure: the counters live in `lib/throttle.ts`. Every
 * key carries the link version, so rotating the link forgets every lock. Same shape as the availability link, with a much lower
 * whole-link ceiling (60 failed attempts an hour, not 300) because a PIN is the only thing between the link and a team.
 */
const lockOnNth = (n: number, windowMs: number, lockMs: number): ThrottleRule => ({ limit: n - 1, windowMs, lockMs })

/** Per manager: five failures, then 15 minutes, doubling per strike up to the one-hour cap. */
export const ENTRY_RULE: ThrottleRule = lockOnNth(5, 15 * 60_000, 15 * 60_000)
/** Per link: 60 failed attempts in an hour pauses NEW sign-ins for 15 minutes (remembered devices are never affected). */
export const LINK_RULE: ThrottleRule = lockOnNth(60, 3_600_000, 15 * 60_000)
/** Wrong add-a-device codes: their own counter, so a code cannot be guessed any faster than a PIN. */
export const CODE_RULE: ThrottleRule = lockOnNth(5, 15 * 60_000, 15 * 60_000)

/** A name that matches no manager shares one of a fixed number of buckets, keyed with a server secret so a name cannot be probed. */
export function fantasyBucket(nameKey: string, buckets: number = FANTASY.unknownNameBuckets): number {
  return createHmac('sha256', deriveKey(HKDF_LABELS.throttle)).update(`fantasy-bucket:${nameKey}`).digest().readUInt32BE(0) % buckets
}

export const entryKey = (linkVersion: number, entryId: number): string => `fantasy:link:${linkVersion}:entry:${entryId}`
export const bucketKey = (linkVersion: number, nameKey: string): string => `fantasy:link:${linkVersion}:bucket:${fantasyBucket(nameKey)}`
export const linkKey = (linkVersion: number): string => `fantasy:link:${linkVersion}:all`

export const LOCKED_MESSAGE = 'Too many tries. Please wait at least 15 minutes and try again.'
export const NO_MATCH_MESSAGE = 'Check your team name and PIN.'
