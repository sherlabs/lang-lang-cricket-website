import { describe, expect, it } from 'vitest'
import { SOCIAL_BACKOFF_MINUTES, SOCIAL_MAX_ATTEMPTS } from '@/config/site'
import { nextAttemptAt } from '@/lib/social/backoff'

const now = new Date('2026-10-12T10:00:00Z')

describe('retry backoff', () => {
  it('waits 5, then 15 minutes, and gives up after 3 attempts', () => {
    expect(nextAttemptAt(now, 1)?.toISOString()).toBe('2026-10-12T10:05:00.000Z')
    expect(nextAttemptAt(now, 2)?.toISOString()).toBe('2026-10-12T10:15:00.000Z')
    expect(nextAttemptAt(now, 3)).toBeNull()
    expect(nextAttemptAt(now, 0)).toBeNull()
  })
  it('takes its numbers from config/site.ts', () => {
    expect(SOCIAL_BACKOFF_MINUTES).toEqual([5, 15, 45])
    expect(SOCIAL_MAX_ATTEMPTS).toBe(3)
    expect(nextAttemptAt(now, 1, [1, 2, 3], 4)?.toISOString()).toBe('2026-10-12T10:01:00.000Z')
    expect(nextAttemptAt(now, 3, [1, 2, 3], 4)?.toISOString()).toBe('2026-10-12T10:03:00.000Z')
  })
})
