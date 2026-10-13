import { describe, expect, it } from 'vitest'
import { cookieStillValid, fantasyCookieName, fantasyToken, fantasyTokenMatches, signFantasyCookie, verifyFantasyCookie } from '../lib/fantasy/link'

const SECRET = 'a-test-secret-of-some-length-1234567'
const NOW = Date.parse('2025-10-10T00:00:00Z')

describe('fantasy link token', () => {
  it('is derived from the secret and the version, 43 characters, never the availability token', async () => {
    const t = fantasyToken(1, SECRET)
    expect(t).toHaveLength(43)
    expect(t).toBe(fantasyToken(1, SECRET))
    expect(fantasyToken(2, SECRET)).not.toBe(t)
    expect(fantasyToken(1, 'another-secret-of-some-length-12345678')).not.toBe(t)
    const { linkToken } = await import('../lib/availability-link')
    expect(linkToken(1, SECRET)).not.toBe(t)
  })
  it('matches the live token only; a rotated link or any garbage is refused', () => {
    expect(fantasyTokenMatches(fantasyToken(1, SECRET), 1, SECRET)).toBe(true)
    expect(fantasyTokenMatches(fantasyToken(1, SECRET), 2, SECRET)).toBe(false)
    expect(fantasyTokenMatches('x'.repeat(43), 1, SECRET)).toBe(false)
    expect(fantasyTokenMatches('', 1, SECRET)).toBe(false)
    expect(fantasyTokenMatches(null, 1, SECRET)).toBe(false)
    expect(fantasyTokenMatches(`${fantasyToken(1, SECRET)}a`, 1, SECRET)).toBe(false)
  })
})

describe('fantasy cookie', () => {
  const data = { entryId: 7, linkVersion: 1, iat: NOW }
  it('round trips and carries nothing but the manager id, link version and issue time', () => {
    const raw = signFantasyCookie(data, SECRET)
    expect(verifyFantasyCookie(raw, NOW + 1000, SECRET)).toEqual(data)
    expect(JSON.parse(Buffer.from(raw.split('.')[0], 'base64url').toString())).toEqual(data)
  })
  it('refuses a tampered body, a tampered signature, another secret, extra parts and old cookies', () => {
    const raw = signFantasyCookie(data, SECRET)
    const [body, sig] = raw.split('.')
    const forged = Buffer.from(JSON.stringify({ ...data, entryId: 8 })).toString('base64url')
    expect(verifyFantasyCookie(`${forged}.${sig}`, NOW, SECRET)).toBeNull()
    expect(verifyFantasyCookie(`${body}.${sig.slice(0, -2)}AA`, NOW, SECRET)).toBeNull()
    expect(verifyFantasyCookie(raw, NOW, 'another-secret-of-some-length-12345678')).toBeNull()
    expect(verifyFantasyCookie(`${raw}.x`, NOW, SECRET)).toBeNull()
    expect(verifyFantasyCookie(raw, NOW + 91 * 86_400_000, SECRET)).toBeNull()
    expect(verifyFantasyCookie(undefined, NOW, SECRET)).toBeNull()
  })
  it('is invalid after a rotation, a disable or a later PIN change', () => {
    expect(cookieStillValid(data, {}, 1)).toBe(true)
    expect(cookieStillValid(data, {}, 2)).toBe(false)
    expect(cookieStillValid(data, { disabled: true }, 1)).toBe(false)
    expect(cookieStillValid(data, { pinSetAt: new Date(NOW - 1000).toISOString() }, 1)).toBe(true)
    expect(cookieStillValid(data, { pinSetAt: new Date(NOW + 1000).toISOString() }, 1)).toBe(false)
  })
  it('uses the club cookie prefix, and __Host- only in production', () => {
    expect(fantasyCookieName(false)).toMatch(/^[a-z0-9]+_fantasy$/)
    expect(fantasyCookieName(true)).toMatch(/^__Host-[a-z0-9]+_fantasy$/)
  })
})
