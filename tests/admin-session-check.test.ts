import { SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { classifySession } from '@/payload/admin/classify-session'
import { checkSession, sessionToken, type SessionCheck } from '@/payload/admin/session-check'
import { failingFindByID, slowFindByID } from './helpers/slow-auth'

const secret = 'test-secret-test-secret-test-secret'
const key = new TextEncoder().encode(secret)
const mint = (claims: Record<string, unknown> = {}, opts: { exp?: number; authVersion?: number } = {}) =>
  new SignJWT({ id: 5, collection: 'users', sid: 's1', ...claims })
    .setProtectedHeader({ alg: 'HS256', authVersion: opts.authVersion ?? 1 })
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(key)
const fakePayload = (findByID: (...a: unknown[]) => unknown, csrf: string[] = []) =>
  ({ secret, config: { cookiePrefix: 'club', csrf }, collections: { users: {} }, findByID }) as never
const withCookie = (token: string, extra: Record<string, string> = {}) => new Headers({ cookie: `club-token=${token}`, ...extra })
const account = (over: Record<string, unknown> = {}) => ({ id: 5, role: 'editor', sessions: [{ id: 's1' }], ...over })

describe('sessionToken (Payload cookie rules)', () => {
  const cfg = { cookiePrefix: 'club', csrf: ['https://site.test'] }
  it('needs the right cookie name', () => {
    expect(sessionToken(new Headers({ cookie: 'other-token=x' }), cfg)).toBeNull()
    expect(sessionToken(new Headers(), cfg)).toBeNull()
  })
  it('refuses a cross-site request when a csrf allowlist is set, like Payload does', () => {
    expect(sessionToken(new Headers({ cookie: 'club-token=t' }), cfg)).toBeNull()
    expect(sessionToken(new Headers({ cookie: 'club-token=t', 'sec-fetch-site': 'cross-site' }), cfg)).toBeNull()
    expect(sessionToken(new Headers({ cookie: 'club-token=t', 'sec-fetch-site': 'same-origin' }), cfg)).toBe('t')
    expect(sessionToken(new Headers({ cookie: 'club-token=t', origin: 'https://site.test' }), cfg)).toBe('t')
    expect(sessionToken(new Headers({ cookie: 'club-token=t', origin: 'https://evil.test' }), cfg)).toBeNull()
  })
  it('accepts the cookie when no allowlist is configured', () => {
    expect(sessionToken(new Headers({ cookie: 'club-token=t' }), { cookiePrefix: 'club', csrf: [] })).toBe('t')
  })
})

describe('checkSession', () => {
  it('valid session: returns the account', async () => {
    const find = vi.fn(async () => account())
    const res = await checkSession(fakePayload(find), withCookie(await mint()))
    expect(res).toMatchObject({ outcome: 'valid', user: { id: 5, role: 'editor', collection: 'users' } })
    expect(find).toHaveBeenCalledTimes(1)
    expect(find).toHaveBeenCalledWith({ collection: 'users', id: 5, depth: 0, overrideAccess: true })
  })

  it('no cookie, a bad or expired token and another auth version are signed out without touching the database', async () => {
    const find = vi.fn(async () => account())
    const p = fakePayload(find)
    expect(await checkSession(p, new Headers())).toEqual({ outcome: 'signed-out', reason: 'no-cookie' })
    expect(await checkSession(p, withCookie('not-a-jwt'))).toEqual({ outcome: 'signed-out', reason: 'bad-token' })
    expect(await checkSession(p, withCookie(await mint({}, { exp: Math.floor(Date.now() / 1000) - 10 })))).toEqual({ outcome: 'signed-out', reason: 'bad-token' })
    expect(await checkSession(p, withCookie(await mint({}, { authVersion: 2 })))).toEqual({ outcome: 'signed-out', reason: 'bad-token' })
    expect(await checkSession(p, withCookie(await mint({ collection: 'nope' })))).toEqual({ outcome: 'signed-out', reason: 'bad-token' })
    expect(await checkSession(p, withCookie(await mint({ sid: undefined })))).toEqual({ outcome: 'signed-out', reason: 'bad-token' })
    expect(find).not.toHaveBeenCalled()
  })

  it('a token signed with another secret is signed out', async () => {
    const forged = await new SignJWT({ id: 5, collection: 'users', sid: 's1' }).setProtectedHeader({ alg: 'HS256', authVersion: 1 }).setExpirationTime('1h').sign(new TextEncoder().encode('another-secret-another-secret-123'))
    expect((await checkSession(fakePayload(async () => account()), withCookie(forged))).outcome).toBe('signed-out')
  })

  it('a removed session or a missing account is signed out (a clean answer)', async () => {
    const token = await mint()
    expect(await checkSession(fakePayload(async () => account({ sessions: [{ id: 'other' }] })), withCookie(token))).toEqual({ outcome: 'signed-out', reason: 'no-session' })
    expect(await checkSession(fakePayload(async () => null), withCookie(token))).toEqual({ outcome: 'signed-out', reason: 'no-user' })
    expect(await checkSession(fakePayload(async () => { throw Object.assign(new Error('Not Found'), { status: 404 }) }), withCookie(token))).toEqual({ outcome: 'signed-out', reason: 'no-user' })
  })

  it('a thrown lookup is an error, never signed out', async () => {
    expect(await checkSession(fakePayload(failingFindByID()), withCookie(await mint()))).toEqual({ outcome: 'error', reason: 'lookup-failed' })
  })

  it('a lookup slower than the timeout is an error', async () => {
    const res = await checkSession(fakePayload(slowFindByID(300, account())), withCookie(await mint()), { timeoutMs: 20 })
    expect(res).toEqual({ outcome: 'error', reason: 'timeout' })
  })

  it('a cookie Payload would ignore (cross-site) is signed out, so it can never be upgraded to staff', async () => {
    const find = vi.fn(async () => account())
    const res = await checkSession(fakePayload(find, ['https://site.test']), withCookie(await mint(), { 'sec-fetch-site': 'cross-site' }))
    expect(res.outcome).toBe('signed-out')
    expect(find).not.toHaveBeenCalled()
  })
})

describe('classifySession (the decision table)', () => {
  const payload = fakePayload(async () => account())
  const cookie = withCookie('anything')
  const check = (out: SessionCheck) => vi.fn(async () => out)

  it('an editor or admin continues without a second look', async () => {
    const c = check({ outcome: 'error', reason: 'timeout' })
    expect(await classifySession({ user: { role: 'editor' }, headers: cookie, payload, check: c })).toMatchObject({ kind: 'staff', session: 'staff' })
    expect(await classifySession({ user: { role: 'admin' }, headers: cookie, payload, check: c })).toMatchObject({ kind: 'staff' })
    expect(c).not.toHaveBeenCalled()
  })

  it('a selector and a disabled editor are not-staff, with no second look; only the selector gets the selector link', async () => {
    const c = check({ outcome: 'error', reason: 'timeout' })
    expect(await classifySession({ user: { role: 'selector' }, headers: cookie, payload, check: c })).toEqual({ kind: 'not-staff', selector: true })
    expect(await classifySession({ user: { role: 'editor', disabled: true }, headers: cookie, payload, check: c })).toEqual({ kind: 'not-staff', selector: false })
    expect(c).not.toHaveBeenCalled()
  })

  it('no user and no cookie is signed out and costs nothing', async () => {
    const c = check({ outcome: 'valid', user: { id: 1, role: 'editor' } })
    expect(await classifySession({ user: null, headers: new Headers(), payload, check: c })).toEqual({ kind: 'signed-out' })
    expect(c).not.toHaveBeenCalled()
  })

  it('cookie + null then a valid staff session continues (the single retry), with that account', async () => {
    const c = check({ outcome: 'valid', user: { id: 1, role: 'editor' } })
    expect(await classifySession({ user: null, headers: cookie, payload, check: c })).toEqual({ kind: 'staff', user: { id: 1, role: 'editor' }, session: 'retried-ok' })
    expect(c).toHaveBeenCalledTimes(1)
  })

  it('cookie + null then a valid selector session is not-staff', async () => {
    expect(await classifySession({ user: null, headers: cookie, payload, check: check({ outcome: 'valid', user: { id: 1, role: 'selector' } }) })).toEqual({ kind: 'not-staff', selector: true })
  })

  it('cookie + null then a clean null or expired answer is signed out (login redirect, never the notice)', async () => {
    expect(await classifySession({ user: null, headers: cookie, payload, check: check({ outcome: 'signed-out', reason: 'bad-token' }) })).toEqual({ kind: 'signed-out' })
    expect(await classifySession({ user: null, headers: cookie, payload, check: check({ outcome: 'signed-out', reason: 'no-session' }) })).toEqual({ kind: 'signed-out' })
  })

  it('cookie + null then a thrown or timed-out lookup is the error notice', async () => {
    expect(await classifySession({ user: null, headers: cookie, payload, check: check({ outcome: 'error', reason: 'lookup-failed' }) })).toEqual({ kind: 'error' })
  })
})
