import { describe, expect, it } from 'vitest'
import { selectorStatus } from '../lib/selector-status'

const now = new Date('2026-10-05T00:00:00Z')
const future = '2026-10-10T00:00:00Z'
const past = '2026-10-01T00:00:00Z'

describe('selectorStatus', () => {
  it('disabled wins over everything', () => {
    expect(selectorStatus({ disabled: true, lastLoginAt: past }, now)).toBe('disabled')
    expect(selectorStatus({ disabled: true, inviteExpiresAt: future }, now)).toBe('disabled')
  })
  it('invited while the window is open and nobody has signed in', () => {
    expect(selectorStatus({ inviteExpiresAt: future }, now)).toBe('invited')
  })
  it('invite expired once the window closes', () => {
    expect(selectorStatus({ inviteExpiresAt: past }, now)).toBe('invite-expired')
  })
  it('active once signed in, even if an old window is still stored', () => {
    expect(selectorStatus({ lastLoginAt: past, inviteExpiresAt: future }, now)).toBe('active')
  })
  it('active when the committee set a password and no invite is pending', () => {
    expect(selectorStatus({}, now)).toBe('active')
  })
})
