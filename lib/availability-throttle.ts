import { createHash } from 'node:crypto'
import { AVAILABILITY } from '@/config/site'
import type { ThrottleRule } from '@/lib/throttle'

/**
 * Throttle keys and rules for identifying on the availability link (announce-teams spec 4.4). Pure: the counters themselves live
 * in `lib/throttle.ts`. Every key carries the link version, so rotating the link forgets every lock.
 *
 * `hit` locks when the count would pass `limit`, so "lock on the Nth failure" is `limit: N - 1`.
 */
const lockOnNth = (n: number, windowMs: number, lockMs: number): ThrottleRule => ({ limit: n - 1, windowMs, lockMs })

/** Per link and per claimed name: five failures, then 15 minutes, doubling per strike up to the one-hour cap. */
export const NAME_RULE: ThrottleRule = lockOnNth(5, 15 * 60_000, 15 * 60_000)
/** Per link: 300 failures in an hour pauses NEW identification for 15 minutes (remembered devices are never affected). */
export const GLOBAL_RULE: ThrottleRule = lockOnNth(300, 3_600_000, 15 * 60_000)

/** A name that matches no player shares one of a fixed number of buckets, so random names cannot grow the table. */
export function nameBucket(normalisedName: string, buckets: number = AVAILABILITY.unknownNameBuckets): number {
  return createHash('sha256').update(normalisedName).digest().readUInt32BE(0) % buckets
}

/** Known and unknown names look the same to the caller; only the key differs (the key itself is hashed before storage). */
export const nameKey = (linkVersion: number, normalisedName: string, known: boolean): string =>
  known ? `avail:link:${linkVersion}:name:${normalisedName}` : `avail:link:${linkVersion}:bucket:${nameBucket(normalisedName)}`
export const globalKey = (linkVersion: number): string => `avail:link:${linkVersion}:all`

export const LOCKED_MESSAGE = 'Too many tries. Please try again later or ask a selector.'
export const NO_MATCH_MESSAGE = 'We could not match those details.'
