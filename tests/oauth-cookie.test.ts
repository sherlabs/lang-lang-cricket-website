import { describe, expect, it } from 'vitest'
import { newNonce, oauthCookieName, oauthCookieOptions, readCookie, serializeOAuthCookie, signOAuthCookie, stateFor, stateMatches, verifyOAuthCookie } from '../lib/oauth-cookie'

const SECRET = 'test-secret-test-secret-test-secret-1'
const OTHER = 'another-secret-another-secret-another-1'
const now = 1_700_000_000_000

describe('oauth cookie', () => {
  const data = { nonce: newNonce(), next: '/selector', iat: now, invite: 'x'.repeat(43) }

  it('round-trips', () => {
    const signed = signOAuthCookie(data, SECRET)
    expect(verifyOAuthCookie(signed, now + 1000, SECRET)).toEqual(data)
  })
  it('rejects a tampered body or signature, another key, and malformed values', () => {
    const signed = signOAuthCookie(data, SECRET)
    const [body, sig] = signed.split('.')
    const forged = Buffer.from(JSON.stringify({ ...data, next: '/selector/x', userId: 1 })).toString('base64url')
    expect(verifyOAuthCookie(`${forged}.${sig}`, now, SECRET)).toBeNull()
    expect(verifyOAuthCookie(`${body}.${sig.slice(0, -2)}AA`, now, SECRET)).toBeNull()
    expect(verifyOAuthCookie(signed, now, OTHER)).toBeNull()
    for (const bad of [undefined, null, '', 'abc', 'a.b.c', `${body}.`, '.x']) expect(verifyOAuthCookie(bad, now, SECRET)).toBeNull()
  })
  it('expires after ten minutes and refuses a cookie from the future', () => {
    const signed = signOAuthCookie(data, SECRET)
    expect(verifyOAuthCookie(signed, now + 9 * 60_000, SECRET)).not.toBeNull()
    expect(verifyOAuthCookie(signed, now + 11 * 60_000, SECRET)).toBeNull()
    expect(verifyOAuthCookie(signed, now - 5 * 60_000, SECRET)).toBeNull()
  })
  it('the state is derived from the cookie-only nonce and compared exactly', () => {
    const state = stateFor(data.nonce, SECRET)
    expect(stateMatches(data, state, SECRET)).toBe(true)
    expect(stateMatches(data, stateFor(newNonce(), SECRET), SECRET)).toBe(false)
    expect(stateMatches(data, '', SECRET)).toBe(false)
    expect(stateMatches(data, null, SECRET)).toBe(false)
    expect(state).not.toContain(data.nonce)
  })
  it('production uses the __Host- prefix with Secure and Path=/ and no Domain; development drops the prefix', () => {
    expect(oauthCookieName(true)).toMatch(/^__Host-.+_sel_oauth$/)
    expect(oauthCookieName(false)).not.toMatch(/^__Host-/)
    const prod = serializeOAuthCookie('v', true)
    expect(prod).toMatch(/^__Host-/)
    expect(prod).toContain('Secure')
    expect(prod).toContain('Path=/')
    expect(prod).toContain('HttpOnly')
    expect(prod).toContain('SameSite=Lax')
    expect(prod).toContain('Max-Age=600')
    expect(prod).not.toMatch(/Domain=/i)
    expect(serializeOAuthCookie('v', false)).not.toContain('Secure')
    expect(oauthCookieOptions(true).path).toBe('/')
    expect(serializeOAuthCookie(null, true)).toContain('Max-Age=0')
  })
  it('reads one cookie from a header', () => {
    expect(readCookie('a=1; b=two; c=3', 'b')).toBe('two')
    expect(readCookie('a=1', 'b')).toBeUndefined()
    expect(readCookie(null, 'b')).toBeUndefined()
  })
})
