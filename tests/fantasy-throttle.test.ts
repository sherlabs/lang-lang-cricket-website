import { describe, expect, it } from 'vitest'
import { bucketKey, CODE_RULE, ENTRY_RULE, entryKey, fantasyBucket, LINK_RULE, linkKey } from '../lib/fantasy/throttle'
import { GLOBAL_RULE } from '../lib/availability-throttle'

process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || 'a-test-secret-of-some-length-1234567'

describe('fantasy throttles', () => {
  it('the whole-link ceiling is 60 failed attempts an hour (not the 300 of availability)', () => {
    expect(LINK_RULE).toEqual({ limit: 59, windowMs: 3_600_000, lockMs: 900_000 })
    expect(GLOBAL_RULE.limit).toBe(299)
  })
  it('a manager locks on the fifth failure, for 15 minutes; codes follow the same rule', () => {
    expect(ENTRY_RULE).toEqual({ limit: 4, windowMs: 900_000, lockMs: 900_000 })
    expect(CODE_RULE).toEqual(ENTRY_RULE)
  })
  it('every key carries the link version so rotating forgets the locks', () => {
    expect(entryKey(1, 5)).not.toBe(entryKey(2, 5))
    expect(linkKey(1)).not.toBe(linkKey(2))
    expect(bucketKey(1, 'abc')).not.toBe(bucketKey(2, 'abc'))
  })
  it('unknown names share a fixed number of buckets', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) seen.add(fantasyBucket(`name${i}`))
    expect(seen.size).toBeLessThanOrEqual(64)
    expect(seen.size).toBeGreaterThan(40)
  })
})
