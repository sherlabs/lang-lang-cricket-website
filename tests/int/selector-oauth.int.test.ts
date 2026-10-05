import { createHmac } from 'node:crypto'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { newNonce, oauthCookieName, serializeOAuthCookie, signOAuthCookie, stateFor } from '@/lib/oauth-cookie'
import { consumeInvite, hashInviteToken, newInviteToken } from '@/lib/selector-invite'
import { handleCallback, handleDataCallback, handleStart } from '@/lib/selector-oauth'
import { clearCollection, destroyTestPayload, getTestPayload } from './helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const ENV = { FACEBOOK_APP_ID: '111', FACEBOOK_APP_SECRET: 'app-secret-xyz' }
const PASS = 'a-long-pass-123'

/** Facebook sign-in, end to end through the route logic, with Facebook replaced by an injected fetch (spec 3.5 and 3.9). */
describe('selector facebook sign-in', () => {
  let payload: Payload
  let origin: string
  const ids: Record<string, number> = {}
  const logs: string[] = []

  /** A pretend Facebook: the code exchange returns a token, /me returns the id we choose. */
  const facebookAs = (fbId: string, opts: { exchangeFails?: boolean } = {}) =>
    vi.fn(async (url: string) => {
      if (url.includes('/oauth/access_token')) return opts.exchangeFails ? new Response('no', { status: 400 }) : Response.json({ access_token: 'FB-ACCESS-TOKEN' })
      return Response.json({ id: fbId, name: 'Someone' })
    })

  const deps = (fetchImpl = facebookAs('999')) => ({ payload, env: ENV, fetch: fetchImpl, production: false })
  const get = (path: string, headers: Record<string, string> = {}) => new Request(`${origin}${path}`, { headers: { host: new URL(origin).host, ...headers } })

  /** Runs /start and returns the cookie header value plus the state Facebook would send back. */
  const start = async (query = '', headers: Record<string, string> = {}) => {
    const res = await handleStart(get(`/selector/facebook/start${query}`, headers), deps())
    expect(res.status).toBe(302)
    const to = new URL(res.headers.get('location')!)
    const setCookie = res.headers.get('set-cookie')!
    const cookie = setCookie.split(';')[0]
    return { res, to, cookie, state: to.searchParams.get('state')! }
  }
  const callback = (query: string, cookie: string | null, fetchImpl = facebookAs('999'), headers: Record<string, string> = {}) =>
    handleCallback(get(`/selector/facebook/callback${query}`, { ...(cookie ? { cookie } : {}), ...headers }), deps(fetchImpl))

  const count = async () => (await payload.count({ collection: 'users', overrideAccess: true })).totalDocs
  const row = async (id: number) => (await payload.db.findOne({ collection: 'users', where: { id: { equals: id } } })) as unknown as { facebookId?: string | null; inviteTokenHash?: string | null; sessions?: unknown[] }
  const makeInvite = async (id: number, hours = 48) => {
    const token = newInviteToken()
    await payload.update({ collection: 'users', id, data: {}, context: { disableRevalidate: true, selectorInvite: { hash: hashInviteToken(token), expiresAt: new Date(Date.now() + hours * 3_600_000).toISOString(), invitedAt: new Date().toISOString() } } })
    return token
  }
  const unlink = (id: number) => payload.update({ collection: 'users', id, data: { facebookId: null }, context: { disableRevalidate: true } })

  beforeAll(async () => {
    payload = await getTestPayload()
    origin = payload.config.serverURL
    await clearCollection(payload, 'users')
    const ctx = { seedAdmin: true, disableRevalidate: true }
    for (const [key, role] of [['sel', 'selector'], ['sel2', 'selector'], ['editor', 'editor'], ['admin', 'admin']] as const) {
      const u = await payload.create({ collection: 'users', data: { email: `${key}@example.com`, password: PASS, role, name: `${key} person` }, context: ctx })
      ids[key] = u.id as number
    }
    vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')))
  })
  beforeEach(async () => {
    logs.length = 0
    for (const k of ['sel', 'sel2']) {
      await unlink(ids[k])
      await payload.db.updateOne({ collection: 'users', id: ids[k], data: { disabled: false, inviteTokenHash: null, inviteExpiresAt: null }, returning: false })
    }
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })

  describe('off by default', () => {
    it('every route is a 404 with the env unset', async () => {
      const off = { payload, env: {}, production: false }
      expect((await handleStart(get('/selector/facebook/start'), off)).status).toBe(404)
      expect((await handleCallback(get('/selector/facebook/callback?code=x&state=y'), off)).status).toBe(404)
      const form = new FormData()
      form.set('signed_request', 'a.b')
      expect((await handleDataCallback(new Request(`${origin}/x`, { method: 'POST', body: form }), off, 'deletion')).status).toBe(404)
      expect((await handleStart(get('/selector/facebook/start'), { payload, env: { FACEBOOK_APP_ID: '1' }, production: false })).status).toBe(404)
    })
    it('start is a 404 on a host that is not the registered origin', async () => {
      const res = await handleStart(new Request(`${origin}/selector/facebook/start`, { headers: { host: 'some-other-preview.vercel.app' } }), deps())
      expect(res.status).toBe(404)
    })
  })

  describe('start', () => {
    it('redirects to Facebook with the expected parameters and sets a single-use signed cookie, without any network call', async () => {
      const fetchSpy = vi.fn()
      const res = await handleStart(get('/selector/facebook/start?next=/selector/account'), { ...deps(), fetch: fetchSpy })
      expect(fetchSpy).not.toHaveBeenCalled()
      const to = new URL(res.headers.get('location')!)
      expect(to.host).toBe('www.facebook.com')
      expect(to.searchParams.get('client_id')).toBe('111')
      expect(to.searchParams.get('scope')).toBe('public_profile')
      expect(to.searchParams.get('redirect_uri')).toBe(`${origin}/selector/facebook/callback`)
      expect(to.searchParams.has('code_challenge')).toBe(false)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
      expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/)
    })
    it('refuses an invite that is not open (back to the invite page, no cookie)', async () => {
      const res = await handleStart(get(`/selector/facebook/start?invite=${newInviteToken()}`), deps())
      expect(res.headers.get('location')).toContain('/selector/invite/')
      expect(res.headers.get('set-cookie')).toBeNull()
    })
  })

  describe('sign in', () => {
    it('happy path: a linked selector signs in, gets a new session cookie, lands on next', async () => {
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: '555' }, context: { disableRevalidate: true, facebookBind: true } })
      const s = await start('?next=/selector/account')
      const before = await row(ids.sel)
      const res = await callback(`?code=CODE&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('555'))
      expect(res.status).toBe(302)
      expect(new URL(res.headers.get('location')!).pathname).toBe('/selector/account')
      const cookies = res.headers.getSetCookie()
      const token = cookies.find((c) => c.startsWith('payload-token='))!.split(';')[0].split('=')[1]
      expect(cookies.some((c) => c.startsWith(`${oauthCookieName(false)}=;`) && /Max-Age=0/.test(c))).toBe(true)
      const auth = await payload.auth({ headers: new Headers({ authorization: `JWT ${token}` }) })
      expect(auth.user?.id).toBe(ids.sel)
      expect(auth.user?.role).toBe('selector')
      expect((await row(ids.sel)).sessions?.length).toBeGreaterThan((before.sessions ?? []).length)
      expect(res.headers.get('cache-control')).toBe('no-store')
    })

    it('never leaks the secret, the code or the access token into the logs or the redirect', async () => {
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: '555' }, context: { disableRevalidate: true, facebookBind: true } })
      const s = await start()
      const bad = await callback(`?code=SECRET-CODE&state=nope`, s.cookie)
      const s2 = await start()
      const res = await callback(`?code=SECRET-CODE&state=${encodeURIComponent(s2.state)}`, s2.cookie, facebookAs('555'))
      const blob = [...logs, bad.headers.get('location'), res.headers.get('location')].join(' ')
      for (const secret of ['app-secret-xyz', 'SECRET-CODE', 'FB-ACCESS-TOKEN']) expect(blob).not.toContain(secret)
    })

    it('a disabled selector cannot sign in', async () => {
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: '555' }, context: { disableRevalidate: true, facebookBind: true } })
      await payload.update({ collection: 'users', id: ids.sel, data: { disabled: true }, context: { disableRevalidate: true } })
      const s = await start()
      const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('555'))
      expect(res.headers.get('location')).toContain('e=not-linked')
      expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(false)
    })

    it('a facebook id on an editor or admin row is refused at sign-in (and cannot be written by the hook)', async () => {
      // The hook refuses the write; plant it with raw SQL to prove sign-in refuses it too.
      const { sql } = await import('@payloadcms/db-postgres/drizzle')
      await payload.db.drizzle.execute(sql`UPDATE "payload"."users" SET facebook_id = '777' WHERE id = ${ids.admin}`)
      try {
        const s = await start()
        const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('777'))
        expect(res.headers.get('location')).toContain('e=not-linked')
        expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(false)
        expect(logs.join(' ')).toContain('non-selector')
      } finally {
        await payload.db.drizzle.execute(sql`UPDATE "payload"."users" SET facebook_id = NULL WHERE id = ${ids.admin}`)
      }
      await expect(payload.update({ collection: 'users', id: ids.editor, data: { facebookId: '778' }, context: { disableRevalidate: true, facebookBind: true } })).rejects.toThrow()
    })
  })

  describe('invite binding (the only way to claim a first login)', () => {
    it('a valid invite binds the facebook id, spends the invite, and signs in', async () => {
      const token = await makeInvite(ids.sel)
      const s = await start(`?invite=${token}`)
      const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('4242'))
      expect(res.status).toBe(302)
      expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(true)
      const r = await row(ids.sel)
      expect(r.facebookId).toBe('4242')
      expect(r.inviteTokenHash ?? null).toBeNull()
      // The same token is dead on both paths.
      expect(await consumeInvite(payload, token)).toBeNull()
    })

    it('the invite is re-validated at the callback: spent or expired between start and callback is refused', async () => {
      const token = await makeInvite(ids.sel)
      const s = await start(`?invite=${token}`)
      await consumeInvite(payload, token) // spent by the password path meanwhile
      const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('4243'))
      expect(res.headers.get('location')).toContain('e=failed')
      expect((await row(ids.sel)).facebookId ?? null).toBeNull()
    })

    it('two concurrent callbacks on one invite: one wins', async () => {
      const token = await makeInvite(ids.sel)
      const a = await start(`?invite=${token}`)
      const b = await start(`?invite=${token}`)
      const [ra, rb] = await Promise.all([
        callback(`?code=C&state=${encodeURIComponent(a.state)}`, a.cookie, facebookAs('5001')),
        callback(`?code=C&state=${encodeURIComponent(b.state)}`, b.cookie, facebookAs('5002')),
      ])
      const wins = [ra, rb].filter((r) => r.headers.getSetCookie().some((c) => c.startsWith('payload-token=')))
      expect(wins).toHaveLength(1)
      expect(['5001', '5002']).toContain((await row(ids.sel)).facebookId)
    })

    it('a facebook id already bound to someone else cannot take a second selector (invite stays open)', async () => {
      await payload.update({ collection: 'users', id: ids.sel2, data: { facebookId: '6000' }, context: { disableRevalidate: true, facebookBind: true } })
      const token = await makeInvite(ids.sel)
      const s = await start(`?invite=${token}`)
      // Facebook says 6000: step a finds sel2 as the owner and signs in AS sel2, never binding it to sel.
      const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('6000'))
      expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(true)
      expect((await row(ids.sel)).facebookId ?? null).toBeNull()
    })

    it('email NEVER binds: a Facebook account with no invite and no link is refused, window open or not, and no user is ever created', async () => {
      const before = await count()
      for (const hours of [48, -1]) {
        await makeInvite(ids.sel, hours) // the window is open (or lapsed) but the cookie carries no invite token
        const s = await start()
        const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('8001'))
        expect(res.headers.get('location')).toContain('e=not-linked')
        expect(res.headers.getSetCookie().some((c) => c.startsWith('payload-token='))).toBe(false)
      }
      expect((await row(ids.sel)).facebookId ?? null).toBeNull()
      expect(await count()).toBe(before)
    })

    it('an expired invite cannot bind', async () => {
      const token = await makeInvite(ids.sel, -1)
      const res = await handleStart(get(`/selector/facebook/start?invite=${token}`), deps())
      expect(res.headers.get('set-cookie')).toBeNull()
    })
  })

  describe('authenticated link flow', () => {
    const signedIn = async (key: string) => {
      const login = await payload.login({ collection: 'users', data: { email: `${key}@example.com`, password: PASS } })
      return { cookie: `payload-token=${login.token}` }
    }
    it('binds only for the signed-in selector who started it', async () => {
      const { cookie: authCookie } = await signedIn('sel')
      const s = await start('?link=1&next=/selector/account', { cookie: authCookie, 'sec-fetch-site': 'same-origin' })
      const both = `${authCookie}; ${s.cookie}`
      const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, both, facebookAs('9100'))
      expect(res.status).toBe(302)
      expect((await row(ids.sel)).facebookId).toBe('9100')
    })
    it('is refused when the current session belongs to someone else', async () => {
      const mine = await signedIn('sel')
      const other = await signedIn('sel2')
      const s = await start('?link=1', { cookie: mine.cookie })
      const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, `${other.cookie}; ${s.cookie}`, facebookAs('9101'))
      expect(res.headers.get('location')).toContain('e=not-linked')
      expect((await row(ids.sel)).facebookId ?? null).toBeNull()
      expect((await row(ids.sel2)).facebookId ?? null).toBeNull()
    })
    it('refuses a facebook id already bound elsewhere', async () => {
      await payload.update({ collection: 'users', id: ids.sel2, data: { facebookId: '9200' }, context: { disableRevalidate: true, facebookBind: true } })
      const mine = await signedIn('sel')
      const s = await start('?link=1', { cookie: mine.cookie })
      // Facebook says 9200: step a signs in as the owner (sel2); it never binds the id to sel.
      await callback(`?code=C&state=${encodeURIComponent(s.state)}`, `${mine.cookie}; ${s.cookie}`, facebookAs('9200'))
      expect((await row(ids.sel)).facebookId ?? null).toBeNull()
    })
    it('start with link=1 and no selector session goes to the login page, with no cookie', async () => {
      const res = await handleStart(get('/selector/facebook/start?link=1'), deps())
      expect(res.headers.get('location')).toContain('/selector/login')
      expect(res.headers.get('set-cookie')).toBeNull()
    })
    it('a staff session cannot use the link flow', async () => {
      const login = await payload.login({ collection: 'users', data: { email: 'admin@example.com', password: PASS } })
      const res = await handleStart(get('/selector/facebook/start?link=1', { cookie: `payload-token=${login.token}` }), deps())
      expect(res.headers.get('set-cookie')).toBeNull()
    })
  })

  describe('CSRF, fixation and failures', () => {
    const goodStart = async () => {
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: '555' }, context: { disableRevalidate: true, facebookBind: true } })
      return start()
    }
    it('refuses a missing cookie, a wrong state, a tampered cookie and another nonce signed validly', async () => {
      const s = await goodStart()
      const u = () => count()
      const before = await u()
      expect((await callback(`?code=C&state=${encodeURIComponent(s.state)}`, null, facebookAs('555'))).headers.get('location')).toContain('e=failed')
      expect((await callback('?code=C&state=wrong', s.cookie, facebookAs('555'))).headers.get('location')).toContain('e=failed')
      const tampered = `${s.cookie.slice(0, -3)}AAA`
      expect((await callback(`?code=C&state=${encodeURIComponent(s.state)}`, tampered, facebookAs('555'))).headers.get('location')).toContain('e=failed')
      // A cookie validly signed for a DIFFERENT nonce (login CSRF: attacker's cookie, victim's state).
      const attackerCookie = `${oauthCookieName(false)}=${signOAuthCookie({ nonce: newNonce(), next: '/selector', iat: Date.now() })}`
      expect((await callback(`?code=C&state=${encodeURIComponent(s.state)}`, attackerCookie, facebookAs('555'))).headers.get('location')).toContain('e=failed')
      expect(await u()).toBe(before)
    })
    it('refuses an expired cookie and a replayed state (the cookie is cleared on every response)', async () => {
      const s = await goodStart()
      const old = `${oauthCookieName(false)}=${signOAuthCookie({ nonce: 'n', next: '/selector', iat: Date.now() - 11 * 60_000 })}`
      const expired = await callback(`?code=C&state=${encodeURIComponent(stateFor('n'))}`, old)
      expect(expired.headers.get('location')).toContain('e=failed')
      expect(expired.headers.getSetCookie().some((c) => /Max-Age=0/.test(c))).toBe(true)
      const first = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('555'))
      expect(first.status).toBe(302)
      // The browser has no cookie any more (it was cleared), so replaying the same query fails.
      const replay = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, null, facebookAs('555'))
      expect(replay.headers.get('location')).toContain('e=failed')
    })
    it('error=access_denied is a friendly cancel', async () => {
      const s = await goodStart()
      const res = await callback(`?error=access_denied&state=${encodeURIComponent(s.state)}`, s.cookie)
      expect(res.headers.get('location')).toContain('e=cancelled')
    })
    it('a Facebook failure (exchange refused) is a friendly failure, not a 500', async () => {
      const s = await goodStart()
      const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('555', { exchangeFails: true }))
      expect(res.headers.get('location')).toContain('e=failed')
    })
    it('next is only ever an allowed selector path', async () => {
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: '555' }, context: { disableRevalidate: true, facebookBind: true } })
      for (const evil of ['https://evil.example', '//evil.example', '/admin', '/selector%2f%2fevil']) {
        const s = await start(`?next=${encodeURIComponent(evil)}`)
        const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, s.cookie, facebookAs('555'))
        expect(new URL(res.headers.get('location')!).pathname).toBe('/selector')
      }
    })
    it('session fixation: a pre-existing payload-token for another user is replaced with a fresh session for the right one', async () => {
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: '555' }, context: { disableRevalidate: true, facebookBind: true } })
      const victim = await payload.login({ collection: 'users', data: { email: 'sel2@example.com', password: PASS } })
      const s = await start()
      const res = await callback(`?code=C&state=${encodeURIComponent(s.state)}`, `payload-token=${victim.token}; ${s.cookie}`, facebookAs('555'))
      const minted = res.headers.getSetCookie().find((c) => c.startsWith('payload-token='))!.split(';')[0].split('=')[1]
      expect(minted).not.toBe(victim.token)
      const auth = await payload.auth({ headers: new Headers({ authorization: `JWT ${minted}` }) })
      expect(auth.user?.id).toBe(ids.sel)
    })
  })

  describe('data deletion and deauthorise callbacks', () => {
    const signed = (userId: string, secret = ENV.FACEBOOK_APP_SECRET) => {
      const payloadPart = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: userId })).toString('base64url')
      return `${createHmac('sha256', secret).update(payloadPart).digest('base64url')}.${payloadPart}`
    }
    const post = (value: string, kind: 'deletion' | 'deauthorize') => {
      const form = new FormData()
      form.set('signed_request', value)
      // No cookie, no session: Meta calls this server to server.
      return handleDataCallback(new Request(`${origin}/selector/facebook/${kind}`, { method: 'POST', body: form }), deps(), kind)
    }
    it('a valid signed_request unlinks and answers with a status url and a confirmation code', async () => {
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: '31337' }, context: { disableRevalidate: true, facebookBind: true } })
      const res = await post(signed('31337'), 'deletion')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.url).toContain('/selector/facebook/deletion-status?code=')
      expect(json.confirmation_code).toBeTruthy()
      expect((await row(ids.sel)).facebookId ?? null).toBeNull()
      // The account itself stays.
      expect(await payload.count({ collection: 'users', where: { id: { equals: ids.sel } } })).toEqual({ totalDocs: 1 })
    })
    it('deauthorize unlinks too', async () => {
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: '31338' }, context: { disableRevalidate: true, facebookBind: true } })
      expect((await post(signed('31338'), 'deauthorize')).status).toBe(200)
      expect((await row(ids.sel)).facebookId ?? null).toBeNull()
    })
    it('rejects a bad signature with 400 and unlinks nothing', async () => {
      await payload.update({ collection: 'users', id: ids.sel, data: { facebookId: '31339' }, context: { disableRevalidate: true, facebookBind: true } })
      expect((await post(signed('31339', 'wrong-secret'), 'deletion')).status).toBe(400)
      expect((await post('garbage', 'deletion')).status).toBe(400)
      expect((await row(ids.sel)).facebookId).toBe('31339')
    })
  })
})
