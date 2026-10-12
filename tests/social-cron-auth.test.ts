import { describe, expect, it } from 'vitest'
import { cronAuthorized } from '@/lib/social/cron-auth'

describe('cron authorisation', () => {
  it('never matches an unset or empty secret', () => {
    for (const secret of [undefined, null, '']) {
      expect(cronAuthorized('Bearer undefined', secret)).toBe(false)
      expect(cronAuthorized('Bearer ', secret)).toBe(false)
      expect(cronAuthorized('Bearer null', secret)).toBe(false)
      expect(cronAuthorized(null, secret)).toBe(false)
    }
  })
  it('rejects a missing, malformed or wrong credential without throwing', () => {
    expect(cronAuthorized(null, 'right')).toBe(false)
    expect(cronAuthorized('right', 'right')).toBe(false)
    expect(cronAuthorized('Basic right', 'right')).toBe(false)
    expect(cronAuthorized('Bearer wrong', 'right')).toBe(false)
    expect(cronAuthorized('Bearer a-much-longer-token-than-the-secret', 'right')).toBe(false)
    expect(cronAuthorized('Bearer r', 'right')).toBe(false)
  })
  it('accepts the secret', () => {
    expect(cronAuthorized('Bearer right', 'right')).toBe(true)
  })
})
