import { isAdmin } from '../access'
import { internalCollection, num, text } from './internalCollection'

/**
 * Rate-limit counters for sign-in, invite and OAuth routes (and, later, the availability link). One row per hashed key (no
 * names or IPs are stored). Written only by `lib/throttle.ts` with one atomic SQL statement, so concurrent serverless requests
 * cannot both read the old count. Admin-readable, never writable through REST.
 */
export const ThrottleHits = internalCollection({
  slug: 'throttle-hits',
  singular: 'Rate limit counter',
  plural: 'Rate limit counters (data)',
  description: 'Counts sign-in attempts so guessing is slowed down. Written by the site; read only.',
  defaultColumns: ['key', 'count', 'lockedUntil'],
  read: isAdmin,
  fields: [
    text('key', { required: true, unique: true, index: true }),
    num('count', { required: true, defaultValue: 0 }),
    { name: 'windowStart', type: 'date', required: true },
    { name: 'lockedUntil', type: 'date' },
    num('strikes', { required: true, defaultValue: 0 }),
  ],
})
