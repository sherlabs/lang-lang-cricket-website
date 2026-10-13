/**
 * Wave F WP-1: Facebook sign-in through the shared broker, end to end through the route logic with a fake broker (an injected
 * fetch and a local Ed25519 key), the real database and the real signed cookie. No network, no Facebook.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { oauthCookieName } from '@/lib/oauth-cookie'
import { resetBrokerCache, sweepJtis } from '@/lib/signin/broker'
import { recordTest } from '@/lib/signin/state'
import { hashInviteToken, newInviteToken } from '@/lib/selector-invite'
import { handleBrokerCallback, handleBrokerEvent, handleCallback, handleDataCallback, handleStart } from '@/lib/selector-oauth'
import { createFakeBroker, type FakeBroker } from '../helpers/fake-broker'
import { cleanTestTables, destroyTestPayload, getTestPayload, resetGlobal, rest, wipeTestData } from './helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const BROKER_ORIGIN = 'https://broker.example'
const CLUB = 'demo-club'
const ENV = { AUTH_BROKER_ORIGIN: BROKER_ORIGIN, AUTH_BROKER_CLUB_ID: CLUB }
const PASS = 'a-long-pass-123'

describe('shared broker sign-in', () => {
  let payload: Payload
  let origin: string
  let broker: FakeBroker
  const ids: Record<string, number> = {}
  const logs: string[] = []

  const deps = (over: Record<string, unknown> = {}) => ({ payload, env: ENV, fetch: broker.fetch, production: false, ...over })
  const get = (path: string, headers: Record<string, string> = {}) => new Request(`${origin}${path}`, { headers: { host: new URL(origin).host, ...headers } })
  const setMode = (mode: 'off' | 'broker' | 'own-app') => payload.updateGlobal({ slug: 'site-settings', data: { signIn: { mode } } as never, overrideAccess: true, context: { disableRevalidate: true } })
  const count = async () => (await payload.count({ collection: 'users', overrideAccess: true })).totalDocs
  const q = async <T>(query: ReturnType<typeof sql>) => ((await payload.db.drizzle.execute(query)) as unknown as { rows: T[] }).rows
  const row = async (id: number) => (await q<{ facebook_id: string | null; facebook_id_via: string | null }>(sql`SELECT facebook_id, facebook_id_via FROM payload.users WHERE id = ${id}`))[0]
  const jtiCount = async () => (await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM payload.auth_broker_jtis`))[0].n
  const bindDirect = (id: number, fbId: string, via: 'own' | 'broker' | null) => q(sql`UPDATE payload.users SET facebook_id = ${fbId}, facebook_id_via = ${via} WHERE id = ${id}`)
  const unlinkAll = () => q(sql`UPDATE payload.users SET facebook_id = NULL, facebook_id_via = NULL, invite_token_hash = NULL, invite_expires_at = NULL, disabled = false`)
  const makeInvite = async (id: number, hours = 48) => {
    const token = newInviteToken()
    await payload.update({ collection: 'users', id, data: {}, context: { disableRevalidate: true, selectorInvite: { hash: hashInviteToken(token), expiresAt: new Date(Date.now() + hours * 3_600_000).toISOString(), invitedAt: new Date().toISOString() } } })
    return token
  }

  /** Runs /start and returns the cookie plus the nonce and state the broker would be given. */
  const start = async (query = '', d = deps()) => {
    const res = await handleStart(get(`/selector/facebook/start${query}`), d)
    expect(res.status).toBe(302)
    const to = new URL(res.headers.get('location')!)
    return { res, to, cookie: res.headers.get('set-cookie')!.split(';')[0], nonce: to.searchParams.get('nonce')!, state: to.searchParams.get('state')! }
  }
  const back = (s: { cookie: string; state: string }, params: Record<string, string>, over: { state?: string; cookie?: string | null } = {}) => {
    const q = new URLSearchParams({ ...params, state: over.state ?? s.state })
    const cookie = over.cookie === undefined ? s.cookie : over.cookie
    return handleBrokerCallback(get(`/selector/facebook/broker-callback?${q}`, cookie ? { cookie } : {}), deps())
  }
  const assertionFor = (s: { nonce: string }, sub: string, o: Parameters<FakeBroker['assertion']>[0] extends infer A ? Partial<A> : never = {}) => broker.assertion({ sub, nonce: s.nonce, ...o })
  const cleared = (res: Response) => res.headers.getSetCookie().some((c) => c.startsWith(`${oauthCookieName(false)}=;`) && /Max-Age=0/.test(c))
  const failureOf = (res: Response) => new URL(res.headers.get('location')!, origin).searchParams.get('e')
  const eventReq = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    new Request(`${origin}/api/websport-auth/events`, { method: 'POST', headers: { host: new URL(origin).host, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const sendEvent = async (type: string, sub: string) => handleBrokerEvent(eventReq({ event: await broker.event({ type, sub }) }), deps())

  beforeAll(async () => {
    payload = await getTestPayload()
    origin = payload.config.serverURL
    await wipeTestData(payload)
    const ctx = { seedAdmin: true, disableRevalidate: true }
    for (const [key, role] of [['sel', 'selector'], ['sel2', 'selector'], ['editor', 'editor'], ['admin', 'admin']] as const) {
      const u = await payload.create({ collection: 'users', data: { email: `${key}@example.com`, password: PASS, role, name: `${key} person` }, context: ctx })
      ids[key] = u.id as number
    }
    vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')))
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })
  beforeEach(async () => {
    logs.length = 0
    resetBrokerCache()
    broker = await createFakeBroker({ origin: BROKER_ORIGIN, clubId: CLUB, ownOrigin: origin })
    await unlinkAll()
    await cleanTestTables(payload, ['auth_broker_jtis', 'throttle_hits'])
    await setMode('broker')
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await wipeTestData(payload)
    await destroyTestPayload(payload)
  })

  describe('start', () => {
    it('sets the signed cookie and redirects to the broker with exactly the four parameters, with no network call', async () => {
      const fetchSpy = vi.fn()
      const s = await start('?next=/selector/account', deps({ fetch: fetchSpy }))
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(s.to.origin + s.to.pathname).toBe(`${BROKER_ORIGIN}/v1/facebook/start`)
      expect([...s.to.searchParams.keys()].sort()).toEqual(['club', 'nonce', 'return_to', 'state'])
      expect(s.to.searchParams.get('club')).toBe(CLUB)
      expect(s.to.searchParams.get('return_to')).toBe(`${origin}/selector/facebook/broker-callback`)
      expect(s.nonce).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
      expect(s.state).toMatch(/^[A-Za-z0-9._~-]{1,256}$/)
      expect(s.res.headers.get('set-cookie')).toMatch(/HttpOnly.*SameSite=Lax/)
    })
    it('refuses an invite that is not open, and a host that is not the registered one', async () => {
      const res = await handleStart(get(`/selector/facebook/start?invite=${newInviteToken()}`), deps())
      expect(res.headers.get('location')).toContain('/selector/invite/')
      expect(res.headers.get('set-cookie')).toBeNull()
      expect((await handleStart(new Request(`${origin}/selector/facebook/start`, { headers: { host: 'preview-1.vercel.app' } }), deps())).status).toBe(404)
    })
  })

  describe('callback', () => {
    it('an invited selector is bound through the broker and signed in', async () => {
      const token = await makeInvite(ids.sel)
      const s = await start(`?invite=${token}`)
      const res = await back(s, { websport_assertion: await assertionFor(s, '4001') })
      expect(res.status).toBe(302)
      expect(new URL(res.headers.get('location')!).pathname).toBe('/selector')
      expect(await row(ids.sel)).toEqual({ facebook_id: '4001', facebook_id_via: 'broker' })
      expect(cleared(res)).toBe(true)
      const jwt = res.headers.getSetCookie().find((c) => c.startsWith('payload-token='))!.split(';')[0].split('=')[1]
      const auth = await payload.auth({ headers: new Headers({ authorization: `JWT ${jwt}` }) })
      expect(auth.user?.id).toBe(ids.sel)
      expect(await jtiCount()).toBe(1)
    })

    it('an already linked selector signs in without an invite', async () => {
      await bindDirect(ids.sel, '4002', 'broker')
      const s = await start('?next=/selector/account')
      const res = await back(s, { websport_assertion: await assertionFor(s, '4002') })
      expect(new URL(res.headers.get('location')!).pathname).toBe('/selector/account')
      expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(true)
    })

    it('a signed-in selector can link from My account', async () => {
      const login = await payload.login({ collection: 'users', data: { email: 'sel@example.com', password: PASS } })
      const res0 = await handleStart(get('/selector/facebook/start?link=1&next=/selector/account', { authorization: `JWT ${login.token}` }), deps())
      const to = new URL(res0.headers.get('location')!)
      const s = { cookie: res0.headers.get('set-cookie')!.split(';')[0], nonce: to.searchParams.get('nonce')!, state: to.searchParams.get('state')! }
      const q = new URLSearchParams({ websport_assertion: await assertionFor(s, '4003'), state: s.state })
      const res = await handleBrokerCallback(get(`/selector/facebook/broker-callback?${q}`, { cookie: s.cookie, authorization: `JWT ${login.token}` }), deps())
      expect(new URL(res.headers.get('location')!).pathname).toBe('/selector/account')
      expect(await row(ids.sel)).toEqual({ facebook_id: '4003', facebook_id_via: 'broker' })
    })

    it('an unknown Facebook person gets not-linked and no user is created', async () => {
      const before = await count()
      const s = await start()
      const res = await back(s, { websport_assertion: await assertionFor(s, '4004') })
      expect(failureOf(res)).toBe('not-linked')
      expect(await count()).toBe(before)
      expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(false)
    })

    it('an expired invite fails', async () => {
      const token = await makeInvite(ids.sel, 48)
      const s = await start(`?invite=${token}`)
      await q(sql`UPDATE payload.users SET invite_expires_at = now() - interval '1 hour' WHERE id = ${ids.sel}`)
      const res = await back(s, { websport_assertion: await assertionFor(s, '4005') })
      expect(failureOf(res)).toBe('failed')
      expect((await row(ids.sel)).facebook_id).toBeNull()
    })

    it('the same assertion cannot be used twice', async () => {
      await bindDirect(ids.sel, '4006', 'broker')
      const s = await start()
      const assertion = await assertionFor(s, '4006')
      expect(failureOf(await back(s, { websport_assertion: assertion }))).toBeNull()
      const again = await back(s, { websport_assertion: assertion })
      expect(failureOf(again)).toBe('failed')
      expect(again.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(false)
      expect(await jtiCount()).toBe(1)
    })

    it('a state mismatch, a missing cookie and a tampered cookie fail, and the cookie is cleared', async () => {
      await bindDirect(ids.sel, '4007', 'broker')
      const s = await start()
      const a = await assertionFor(s, '4007')
      const wrong = await back(s, { websport_assertion: a }, { state: 'nope' })
      expect(failureOf(wrong)).toBe('failed')
      expect(cleared(wrong)).toBe(true)
      expect(failureOf(await back(s, { websport_assertion: a }, { cookie: null }))).toBe('failed')
      expect(failureOf(await back(s, { websport_assertion: a }, { cookie: `${s.cookie}x` }))).toBe('failed')
      expect(await jtiCount()).toBe(0)
    })

    it('an assertion for another nonce, club or audience fails', async () => {
      await bindDirect(ids.sel, '4008', 'broker')
      const s = await start()
      expect(failureOf(await back(s, { websport_assertion: await broker.assertion({ sub: '4008', nonce: 'x'.repeat(43) }) }))).toBe('failed')
      expect(failureOf(await back(s, { websport_assertion: await assertionFor(s, '4008', { club: 'other' }) }))).toBe('failed')
      expect(failureOf(await back(s, { websport_assertion: await broker.assertion({ sub: '4008', nonce: s.nonce }, { aud: 'https://elsewhere.example' }) }))).toBe('failed')
    })

    it('websport_error=denied shows the cancelled message, any other error shows failed', async () => {
      const s = await start()
      expect(failureOf(await back(s, { websport_error: 'denied' }))).toBe('cancelled')
      expect(failureOf(await back(s, { websport_error: 'exchange_failed' }))).toBe('failed')
    })

    it('never puts the assertion in the logs', async () => {
      const s = await start()
      const a = await assertionFor(s, '4009', { club: 'other' })
      await back(s, { websport_assertion: a })
      expect(logs.join(' ')).not.toContain(a)
    })
  })

  describe('modes', () => {
    it('off and own-app answer 404 on the broker routes', async () => {
      const s = await start()
      for (const mode of ['off', 'own-app'] as const) {
        await setMode(mode)
        const env = mode === 'own-app' ? { ...ENV, FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' } : ENV
        expect((await handleBrokerCallback(get('/selector/facebook/broker-callback?state=x', { cookie: s.cookie }), deps({ env }))).status).toBe(404)
        if (mode === 'off') expect((await handleStart(get('/selector/facebook/start'), deps({ env }))).status).toBe(404)
      }
    })
    it('broker mode answers 404 on the direct callback and data-deletion routes', async () => {
      const env = { ...ENV, FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' }
      expect((await handleCallback(get('/selector/facebook/callback?code=x&state=y'), deps({ env }))).status).toBe(404)
      const form = new FormData()
      form.set('signed_request', 'a.b')
      expect((await handleDataCallback(new Request(`${origin}/x`, { method: 'POST', body: form, headers: { host: new URL(origin).host } }), deps({ env }), 'deletion')).status).toBe(404)
    })
    it('stored broker with only the own-app env keeps the direct flow (the #39 deployment keeps its button)', async () => {
      const env = { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' }
      const res = await handleStart(get('/selector/facebook/start'), deps({ env }))
      expect(new URL(res.headers.get('location')!).host).toBe('www.facebook.com')
    })
  })

  describe('id spaces and roles', () => {
    it('an id bound under the own app is not matched by a broker assertion with the same digits, and the reverse', async () => {
      await bindDirect(ids.sel, '5001', 'own')
      const s = await start()
      const res = await back(s, { websport_assertion: await assertionFor(s, '5001') })
      expect(failureOf(res)).toBe('not-linked')
      expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(false)

      await unlinkAll()
      await bindDirect(ids.sel, '5002', 'broker')
      const env = { ...ENV, FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' }
      await setMode('own-app')
      const fb = vi.fn(async (url: string) => (url.includes('/oauth/access_token') ? Response.json({ access_token: 't' }) : Response.json({ id: '5002', name: 'x' })))
      const d = deps({ env, fetch: fb })
      const res0 = await handleStart(get('/selector/facebook/start'), d)
      const to = new URL(res0.headers.get('location')!)
      const cookie = res0.headers.get('set-cookie')!.split(';')[0]
      const direct = await handleCallback(get(`/selector/facebook/callback?code=c&state=${encodeURIComponent(to.searchParams.get('state')!)}`, { cookie }), d)
      expect(failureOf(direct)).toBe('not-linked')
    })
    it('a null recorded space counts as the own app', async () => {
      await bindDirect(ids.sel, '5003', null)
      const s = await start()
      expect(failureOf(await back(s, { websport_assertion: await assertionFor(s, '5003') }))).toBe('not-linked')
    })
    it('two different people can hold the same digits in the two spaces, and not twice in one', async () => {
      await bindDirect(ids.sel, '5004', 'own')
      await bindDirect(ids.sel2, '5004', 'broker')
      await expect(bindDirect(ids.sel2, '5004', 'own')).rejects.toThrow()
    })
    it('an invite binds under the space of the flow that used it', async () => {
      await bindDirect(ids.sel2, '5005', 'own')
      const token = await makeInvite(ids.sel)
      const s = await start(`?invite=${token}`)
      const res = await back(s, { websport_assertion: await assertionFor(s, '5005') })
      expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(true)
      expect(await row(ids.sel)).toEqual({ facebook_id: '5005', facebook_id_via: 'broker' })
      expect(await row(ids.sel2)).toEqual({ facebook_id: '5005', facebook_id_via: 'own' })
    })
    it('an editor or admin row that carries a facebook id is never signed in, in either mode', async () => {
      await bindDirect(ids.editor, '6001', 'broker')
      await bindDirect(ids.admin, '6002', 'own')
      for (const [sub, id] of [['6001', ids.editor], ['6002', ids.admin]] as const) {
        const s = await start()
        const res = await back(s, { websport_assertion: await assertionFor(s, sub) })
        expect(failureOf(res)).toBe('not-linked')
        expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(false)
        expect((await row(id)).facebook_id).toBe(sub)
      }
    })
    it('a disabled selector is not signed in', async () => {
      await bindDirect(ids.sel, '6003', 'broker')
      await q(sql`UPDATE payload.users SET disabled = true WHERE id = ${ids.sel}`)
      const s = await start()
      expect(failureOf(await back(s, { websport_assertion: await assertionFor(s, '6003') }))).toBe('not-linked')
    })
    it('unlinking clears the recorded space with the id', async () => {
      await bindDirect(ids.sel, '6004', 'broker')
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: null }, overrideAccess: true, context: { disableRevalidate: true } })
      expect(await row(ids.sel)).toEqual({ facebook_id: null, facebook_id_via: null })
    })
  })

  describe('events', () => {
    it('both types unlink only broker-bound rows; an own-bound row with the same digits survives', async () => {
      for (const type of ['facebook.data_deletion', 'facebook.deauthorize']) {
        await unlinkAll()
        await bindDirect(ids.sel, '7001', 'broker')
        await bindDirect(ids.sel2, '7001', 'own')
        const res = await sendEvent(type, '7001')
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({})
        expect(await row(ids.sel)).toEqual({ facebook_id: null, facebook_id_via: null })
        expect(await row(ids.sel2)).toEqual({ facebook_id: '7001', facebook_id_via: 'own' })
      }
    })
    it('still unlinks broker-bound rows after the admin switches to off, but answers 404 without the broker env', async () => {
      await bindDirect(ids.sel, '7010', 'broker')
      await setMode('off')
      expect((await sendEvent('facebook.data_deletion', '7010')).status).toBe(200)
      expect(await row(ids.sel)).toEqual({ facebook_id: null, facebook_id_via: null })
      expect((await handleBrokerEvent(eventReq({ event: 'x' }), deps({ env: {} }))).status).toBe(404)
      await setMode('broker')
    })
    it("a non-selector row's broker link is also removed (and it was never signable)", async () => {
      await bindDirect(ids.editor, '7002', 'broker')
      expect((await sendEvent('facebook.deauthorize', '7002')).status).toBe(200)
      expect((await row(ids.editor)).facebook_id).toBeNull()
    })
    it('an unknown person still gets 200', async () => {
      expect((await sendEvent('facebook.data_deletion', '999999')).status).toBe(200)
    })
    it('a bad signature, wrong audience, wrong content type and oversize body get 400', async () => {
      await bindDirect(ids.sel, '7003', 'broker')
      const other = await createFakeBroker({ origin: BROKER_ORIGIN, clubId: CLUB, ownOrigin: origin })
      expect((await handleBrokerEvent(eventReq({ event: await other.event({ sub: '7003' }) }), deps())).status).toBe(400)
      expect((await handleBrokerEvent(eventReq({ event: await broker.event({ sub: '7003' }, { aud: 'https://elsewhere.example' }) }), deps())).status).toBe(400)
      expect((await handleBrokerEvent(eventReq({ event: await broker.event({ sub: '7003' }) }, { 'content-type': 'text/plain' }), deps())).status).toBe(400)
      expect((await handleBrokerEvent(eventReq('x'.repeat(9000)), deps())).status).toBe(400)
      expect((await handleBrokerEvent(eventReq('not json'), deps())).status).toBe(400)
      const res = await handleBrokerEvent(eventReq({ event: 'a.b.c' }), deps())
      expect(await res.json()).toEqual({ error: 'invalid event' })
      expect((await row(ids.sel)).facebook_id).toBe('7003')
    })
    it('a replayed valid event answers 200 and the replay table does not change', async () => {
      await bindDirect(ids.sel, '7004', 'broker')
      const event = await broker.event({ sub: '7004' })
      const before = await jtiCount()
      expect((await handleBrokerEvent(eventReq({ event }), deps())).status).toBe(200)
      expect((await handleBrokerEvent(eventReq({ event }), deps())).status).toBe(200)
      expect(await jtiCount()).toBe(before)
    })
    it('a flood of invalid events spends only the failure ceiling; a valid event after that is still processed', async () => {
      await bindDirect(ids.sel, '7005', 'broker')
      const statuses: number[] = []
      for (let i = 0; i < 125; i++) statuses.push((await handleBrokerEvent(eventReq({ event: 'x.y.z' }), deps())).status)
      expect(statuses.slice(0, 120).every((s) => s === 400)).toBe(true)
      expect(statuses.slice(120).every((s) => s === 429)).toBe(true)
      const res = await sendEvent('facebook.data_deletion', '7005')
      expect(res.status).toBe(200)
      expect((await row(ids.sel)).facebook_id).toBeNull()
    })
    it('records how many selectors were unlinked for the admin notification', async () => {
      await resetGlobal(payload, 'site-settings')
      const { readSignInState } = await import('@/lib/signin/state')
      await bindDirect(ids.sel, '7006', 'broker')
      await sendEvent('facebook.data_deletion', '7006')
      expect((await readSignInState(payload)).lastEvent.unlinked).toBe(1)
      await bindDirect(ids.sel2, '7007', 'broker')
      await sendEvent('facebook.deauthorize', '7007')
      const state = await readSignInState(payload)
      expect(state.lastEvent.unlinked).toBe(2)
      expect(state.mode).toBe('broker')
    })
  })

  describe('replay table housekeeping', () => {
    it('sweeps only rows expired more than a day ago', async () => {
      await q(sql`INSERT INTO payload.auth_broker_jtis (jti, expires_at, created_at, updated_at) VALUES ('old-one', now() - interval '2 days', now(), now()), ('new-one', now() - interval '1 hour', now(), now())`)
      await sweepJtis(payload)
      expect((await q<{ jti: string }>(sql`SELECT jti FROM payload.auth_broker_jtis`)).map((r) => r.jti)).toEqual(['new-one'])
    })
  })

  describe('REST and admin access', () => {
    let tokens: Record<'selector' | 'editor' | 'admin', string>
    beforeAll(async () => {
      const login = async (email: string) => (await payload.login({ collection: 'users', data: { email, password: PASS } })).token!
      tokens = { selector: await login('sel@example.com'), editor: await login('editor@example.com'), admin: await login('admin@example.com') }
    })
    it('the sign-in group is absent for anonymous, selector and editor and present for admin', async () => {
      await setMode('own-app')
      for (const token of [undefined, tokens.selector, tokens.editor]) {
        const res = await rest('GET', '/globals/site-settings', { token })
        expect(res.status).toBe(200)
        expect(res.json.signIn).toBeUndefined()
        expect(JSON.stringify(res.json)).not.toContain('own-app')
      }
      const admin = await rest('GET', '/globals/site-settings', { token: tokens.admin })
      expect(admin.json.signIn.mode).toBe('own-app')
    })
    it('an editor cannot change the mode; an admin can, and the code-written results survive the save', async () => {
      await recordTest(payload, { ok: false, summary: 'The broker took too long to answer.', checks: [] })
      await rest('POST', '/globals/site-settings', { token: tokens.editor, body: { signIn: { mode: 'off' } } })
      expect((await rest('GET', '/globals/site-settings', { token: tokens.admin })).json.signIn.mode).toBe('broker')
      const saved = await rest('POST', '/globals/site-settings', { token: tokens.admin, body: { signIn: { mode: 'off' } } })
      expect(saved.status).toBe(200)
      const after = (await rest('GET', '/globals/site-settings', { token: tokens.admin })).json.signIn
      expect(after.mode).toBe('off')
      expect(after.lastTest.summary).toBe('The broker took too long to answer.')
      expect(after.lastTest.ok).toBe(false)
    })
    it('an admin cannot write the code-written result over REST', async () => {
      await rest('POST', '/globals/site-settings', { token: tokens.admin, body: { signIn: { lastTest: { ok: true, summary: 'forged' } } } })
      const after = (await rest('GET', '/globals/site-settings', { token: tokens.admin })).json.signIn
      expect(after.lastTest?.summary).not.toBe('forged')
    })
    it('the replay table is readable by an admin only and writable by nobody', async () => {
      await q(sql`INSERT INTO payload.auth_broker_jtis (jti, expires_at, created_at, updated_at) VALUES ('rest-probe', now(), now(), now())`)
      expect((await rest('GET', '/auth-broker-jtis')).status).toBe(403)
      expect((await rest('GET', '/auth-broker-jtis', { token: tokens.selector })).status).toBe(403)
      expect((await rest('GET', '/auth-broker-jtis', { token: tokens.editor })).status).toBe(403)
      expect((await rest('GET', '/auth-broker-jtis', { token: tokens.admin })).status).toBe(200)
      expect((await rest('POST', '/auth-broker-jtis', { token: tokens.admin, body: { jti: 'x'.repeat(20), expiresAt: new Date().toISOString() } })).status).toBeGreaterThanOrEqual(400)
    })
    it('facebook ids and spaces are never readable over REST', async () => {
      await bindDirect(ids.sel, '8001', 'broker')
      const own = await rest('GET', `/users/${ids.sel}`, { token: tokens.selector })
      expect(JSON.stringify(own.json)).not.toMatch(/8001|facebookIdVia|facebookId"/)
      const all = await rest('GET', `/users?limit=50&depth=0`, { token: tokens.admin })
      expect(JSON.stringify(all.json)).not.toMatch(/8001|facebookIdVia/)
      expect((await rest('PATCH', `/users/${ids.sel}`, { token: tokens.selector, body: { facebookIdVia: 'own' } })).status).toBeGreaterThanOrEqual(400)
    })

    describe('Test connection route', () => {
      const post = async (token?: string, originHeader: string | null = origin) => {
        const { POST } = await import('@/app/api/admin/signin/test/route')
        const headers: Record<string, string> = {}
        if (originHeader) headers.origin = originHeader
        if (token) headers.authorization = `JWT ${token}`
        return POST(new Request(`${origin}/api/admin/signin/test`, { method: 'POST', headers }))
      }
      it('refuses anonymous, selector and editor callers, and a foreign origin', async () => {
        expect((await post()).status).toBe(403)
        expect((await post(tokens.selector)).status).toBe(403)
        expect((await post(tokens.editor)).status).toBe(403)
        expect((await post(tokens.admin, 'https://evil.example')).status).toBe(403)
        expect((await post(tokens.admin, null)).status).toBe(403)
      })
      it('lets an admin run it, stores the result and only ever calls the configured broker', async () => {
        vi.stubGlobal('fetch', broker.fetch)
        vi.stubEnv('AUTH_BROKER_ORIGIN', BROKER_ORIGIN)
        vi.stubEnv('AUTH_BROKER_CLUB_ID', CLUB)
        const res = await post(tokens.admin)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(true)
        expect(broker.calls.length).toBe(3)
        expect(broker.calls.every((c) => c.startsWith(BROKER_ORIGIN))).toBe(true)
        const stored = (await rest('GET', '/globals/site-settings', { token: tokens.admin })).json.signIn.lastTest
        expect(stored.ok).toBe(true)
        expect(stored.at).toBeTruthy()
        broker.behaviour.start = 400
        const bad = await (await post(tokens.admin)).json()
        expect(bad.ok).toBe(false)
        expect((await rest('GET', '/globals/site-settings', { token: tokens.admin })).json.signIn.lastTest.ok).toBe(false)
      })
    })
  })
})
