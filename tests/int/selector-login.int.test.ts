import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashInviteToken, newInviteToken } from '@/lib/selector-invite'
import { clear, hit, isLocked, ipHit } from '@/lib/throttle'
import { clearCollection, destroyTestPayload, getTestPayload, wipeTestData } from './helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const ctl = vi.hoisted(() => ({ headers: new Headers(), cookieSet: [] as Array<Record<string, unknown>> }))
vi.mock('next/headers', () => ({
  headers: async () => ctl.headers,
  cookies: async () => ({ set: (c: Record<string, unknown>) => void ctl.cookieSet.push(c), get: () => undefined }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))

const PASS = 'a-long-pass-123'
const form = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}

describe('throttle (atomic, serverless-safe)', () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  })
  afterAll(async () => {
    // Later files create their own users with the conventional `<role>@example.com` addresses and passwords.
    await clearCollection(payload, 'users')
    await wipeTestData(payload)
    await destroyTestPayload(payload)
  })

  it('allows `limit` hits, then locks, with a retry time', async () => {
    const rule = { limit: 3, windowMs: 60_000, lockMs: 60_000 }
    const results = []
    for (let i = 0; i < 5; i++) results.push(await hit(payload, 'unit:a', rule))
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false])
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0)
    expect((await isLocked(payload, 'unit:a')).allowed).toBe(false)
    await clear(payload, 'unit:a')
    expect((await isLocked(payload, 'unit:a')).allowed).toBe(true)
    expect((await hit(payload, 'unit:a', rule)).allowed).toBe(true)
  })
  it('concurrent hits cannot both read the old count: exactly `limit` are allowed', async () => {
    const rule = { limit: 5, windowMs: 60_000, lockMs: 60_000 }
    const results = await Promise.all(Array.from({ length: 20 }, () => hit(payload, 'unit:race', rule)))
    expect(results.filter((r) => r.allowed)).toHaveLength(5)
  })
  it('the window resets the count, and keys are independent', async () => {
    const rule = { limit: 2, windowMs: 1, lockMs: 60_000 }
    await hit(payload, 'unit:w', rule)
    await new Promise((r) => setTimeout(r, 15))
    expect((await hit(payload, 'unit:w', rule)).allowed).toBe(true)
    expect((await hit(payload, 'unit:other', { limit: 1, windowMs: 60_000, lockMs: 1000 })).allowed).toBe(true)
  })
  it('stores a hash, never the raw key, and skips the IP bucket when there is no trusted IP', async () => {
    await hit(payload, 'sel-login:ip:203.0.113.9', { limit: 5, windowMs: 1000, lockMs: 1000 })
    const rows = await payload.find({ collection: 'throttle-hits', limit: 100, overrideAccess: true })
    expect(rows.docs.every((d) => /^[0-9a-f]{64}$/.test(d.key))).toBe(true)
    expect(JSON.stringify(rows.docs)).not.toContain('203.0.113.9')
    expect(await ipHit(payload, 'sel-login', null)).toEqual({ allowed: true, retryAfterSeconds: 0 })
  })
  it('doubles the lock per strike (capped) and refuses REST access to the table', async () => {
    const rule = { limit: 1, windowMs: 60_000, lockMs: 1000 }
    await hit(payload, 'unit:s', rule)
    const first = await hit(payload, 'unit:s', rule)
    expect(first.allowed).toBe(false)
    expect(first.retryAfterSeconds).toBeLessThanOrEqual(2)
    const { rest } = await import('./helpers')
    expect((await rest('GET', '/throttle-hits')).status).toBe(403)
    expect((await rest('POST', '/throttle-hits', { body: { key: 'x' } })).status).toBe(403)
  })
})

describe('selector login, invite and account actions', () => {
  let payload: Payload
  let actions: typeof import('@/app/(frontend)/selector/actions')
  let id: number

  const redirected = async (p: Promise<unknown>) => {
    try {
      await p
      return null
    } catch (e) {
      const m = /^NEXT_REDIRECT (.*)$/.exec((e as Error).message)
      if (!m) throw e
      return m[1]
    }
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    actions = await import('@/app/(frontend)/selector/actions')
    await clearCollection(payload, 'users')
    const ctx = { seedAdmin: true, disableRevalidate: true }
    await payload.create({ collection: 'users', data: { email: 'admin@example.com', password: PASS, role: 'admin' }, context: ctx })
    id = (await payload.create({ collection: 'users', data: { email: 'sel@example.com', password: PASS, role: 'selector', name: 'Sel Person' }, context: ctx })).id as number
  })
  beforeEach(() => {
    ctl.cookieSet.length = 0
    ctl.headers = new Headers()
  })
  afterAll(async () => {
    await clearCollection(payload, 'users')
    await wipeTestData(payload)
    await destroyTestPayload(payload)
  })

  it('a good sign-in sets the session cookie and goes to next; a bad next falls back', async () => {
    const to = await redirected(actions.loginAction({}, form({ email: 'Sel@Example.com', password: PASS, next: '/selector/account' })))
    expect(to).toBe('/selector/account')
    expect(ctl.cookieSet[0]).toMatchObject({ name: 'payload-token', httpOnly: true })
    ctl.cookieSet.length = 0
    expect(await redirected(actions.loginAction({}, form({ email: 'sel@example.com', password: PASS, next: 'https://evil.example' })))).toBe('/selector')
  })

  it('one uniform message for a wrong password, an unknown email and a disabled account; no cookie', async () => {
    const wrong = await actions.loginAction({}, form({ email: 'sel@example.com', password: 'nope-nope-nope-1' }))
    const unknown = await actions.loginAction({}, form({ email: 'nobody@example.com', password: PASS }))
    await payload.update({ collection: 'users', id, data: { disabled: true }, context: { disableRevalidate: true } })
    const disabled = await actions.loginAction({}, form({ email: 'sel@example.com', password: PASS }))
    await payload.update({ collection: 'users', id, data: { disabled: false }, context: { disableRevalidate: true } })
    expect(wrong).toEqual({ error: 'Email or password is not right.' })
    expect(unknown).toEqual(wrong)
    expect(disabled).toEqual(wrong)
    expect(ctl.cookieSet).toHaveLength(0)
  })

  it('locks after five bad attempts and then refuses even the right password, with the same message', async () => {
    await payload.create({ collection: 'users', data: { email: 'lock@example.com', password: PASS, role: 'selector' }, context: { seedAdmin: true, disableRevalidate: true } })
    for (let i = 0; i < 5; i++) await actions.loginAction({}, form({ email: 'lock@example.com', password: `bad-password-${i}` }))
    const locked = await actions.loginAction({}, form({ email: 'lock@example.com', password: PASS }))
    expect(locked).toEqual({ error: 'Email or password is not right.' })
    expect(ctl.cookieSet).toHaveLength(0)
  })

  it('the invite page action: validates, then spends the invite once and signs the person in', async () => {
    const token = newInviteToken()
    await payload.update({ collection: 'users', id, data: {}, context: { disableRevalidate: true, selectorInvite: { hash: hashInviteToken(token), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), invitedAt: new Date().toISOString() } } })
    expect((await actions.chooseInvitePassword({}, form({ token, password: 'short', confirm: 'short' }))).error).toMatch(/at least 10/)
    expect((await actions.chooseInvitePassword({}, form({ token, password: 'brand-new-pass-1', confirm: 'different-pass-1' }))).error).toMatch(/not the same/)
    // Neither failure spent it.
    const to = await redirected(actions.chooseInvitePassword({}, form({ token, password: 'brand-new-pass-1', confirm: 'brand-new-pass-1' })))
    expect(to).toBe('/selector')
    expect(ctl.cookieSet[0]).toMatchObject({ name: 'payload-token' })
    // Now it is dead.
    expect((await actions.chooseInvitePassword({}, form({ token, password: 'another-pass-123', confirm: 'another-pass-123' }))).error).toMatch(/expired/)
    expect((await payload.login({ collection: 'users', data: { email: 'sel@example.com', password: 'brand-new-pass-1' } })).token).toBeTruthy()
    expect((await actions.chooseInvitePassword({}, form({ token: 'x'.repeat(43), password: 'another-pass-123', confirm: 'another-pass-123' }))).error).toMatch(/expired/)
  })

  it('two requests racing on one invite: one sets the password, the other is refused', async () => {
    const token = newInviteToken()
    await payload.update({ collection: 'users', id, data: {}, context: { disableRevalidate: true, selectorInvite: { hash: hashInviteToken(token), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), invitedAt: new Date().toISOString() } } })
    const run = (pw: string) => actions.chooseInvitePassword({}, form({ token, password: pw, confirm: pw })).then((r) => ({ r }), (e: Error) => ({ e: e.message }))
    const results = await Promise.all([run('racer-one-pass-1'), run('racer-two-pass-1')])
    expect(results.filter((x) => 'e' in x && x.e.startsWith('NEXT_REDIRECT'))).toHaveLength(1)
    expect(results.filter((x) => 'r' in x && x.r.error)).toHaveLength(1)
  })

  it('the area requires a selection user: anonymous is sent to the login page with next', async () => {
    const { requireSelection } = await import('@/lib/selector-auth')
    expect(await redirected(requireSelection('/selector/account'))).toBe('/selector/login?next=%2Fselector%2Faccount')
  })

  it('a signed-in selector passes requireSelection from a cross-site navigation (the page-render rule), but not a cross-origin POST', async () => {
    const { requireSelection, getSelectionUser } = await import('@/lib/selector-auth')
    await payload.update({ collection: 'users', id, data: { password: 'brand-new-pass-1' }, context: { disableRevalidate: true } })
    const login = await payload.login({ collection: 'users', data: { email: 'sel@example.com', password: 'brand-new-pass-1' } })
    ctl.headers = new Headers({ cookie: `payload-token=${login.token}`, 'sec-fetch-site': 'cross-site' })
    expect((await requireSelection()).id).toBe(id)
    ctl.headers = new Headers({ cookie: `payload-token=${login.token}`, origin: 'https://evil.example' })
    expect(await getSelectionUser()).toBeNull()
  })

  it('changing a password needs the current one and keeps the sessions of this browser only', async () => {
    await payload.update({ collection: 'users', id, data: { password: 'brand-new-pass-1' }, context: { disableRevalidate: true } })
    const login = await payload.login({ collection: 'users', data: { email: 'sel@example.com', password: 'brand-new-pass-1' } })
    const other = await payload.login({ collection: 'users', data: { email: 'sel@example.com', password: 'brand-new-pass-1' } })
    ctl.headers = new Headers({ cookie: `payload-token=${login.token}`, 'sec-fetch-site': 'same-origin' })
    expect((await actions.changePasswordAction({}, form({ current: 'wrong-wrong-1', password: 'changed-pass-123', confirm: 'changed-pass-123' }))).error).toBeTruthy()
    expect((await actions.changePasswordAction({}, form({ current: 'brand-new-pass-1', password: 'changed-pass-123', confirm: 'changed-pass-123' }))).ok).toMatch(/changed/)
    expect((await payload.auth({ headers: new Headers({ authorization: `JWT ${login.token}` }) })).user?.id).toBe(id)
    expect((await payload.auth({ headers: new Headers({ authorization: `JWT ${other.token}` }) })).user).toBeNull()
  })

  describe('review fixes: no-password selectors, locked invitees, staff current password', () => {
    const ctx = { seedAdmin: true, disableRevalidate: true }
    const signedIn = async (email: string, password: string) => {
      const login = await payload.login({ collection: 'users', data: { email, password } })
      ctl.headers = new Headers({ cookie: `payload-token=${login.token}`, 'sec-fetch-site': 'same-origin' })
    }

    it('a spent invite still signs the person in when the account was locked by bad REST logins', async () => {
      const row = await payload.create({ collection: 'users', data: { email: 'locked-invitee@example.com', password: 'placeholder-pass-1', role: 'selector' }, context: { ...ctx, randomPassword: true } })
      for (let i = 0; i < 5; i++) await payload.login({ collection: 'users', data: { email: 'locked-invitee@example.com', password: `bad-${i}-xxxxxxx` } }).catch(() => null)
      await expect(payload.login({ collection: 'users', data: { email: 'locked-invitee@example.com', password: 'placeholder-pass-1' } })).rejects.toThrow()
      const token = newInviteToken()
      await payload.update({ collection: 'users', id: row.id, data: {}, context: { disableRevalidate: true, selectorInvite: { hash: hashInviteToken(token), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), invitedAt: new Date().toISOString() } } })
      expect(await redirected(actions.chooseInvitePassword({}, form({ token, password: 'chosen-after-lock-1', confirm: 'chosen-after-lock-1' })))).toBe('/selector')
      expect(ctl.cookieSet[0]).toMatchObject({ name: 'payload-token' })
      expect((await payload.login({ collection: 'users', data: { email: 'locked-invitee@example.com', password: 'chosen-after-lock-1' } })).token).toBeTruthy()
    })

    it('a Facebook-invited selector has no password, may choose one on the live session alone, and then must give it to change it', async () => {
      const queries = await import('@/lib/selector-queries')
      const row = await payload.create({ collection: 'users', data: { email: 'fb-only@example.com', password: 'placeholder-pass-2', role: 'selector' }, context: { ...ctx, randomPassword: true } })
      const user = { id: row.id, role: 'selector', email: row.email } as never
      expect((await queries.getOwnAccount(user))?.hasPassword).toBe(false)
      await payload.update({ collection: 'users', id: row.id, data: { facebookId: 'fb-nopass-1' }, overrideAccess: true, context: { disableRevalidate: true, facebookBind: true } })
      // Unlinking would lock them out: refused.
      expect(await queries.unlinkOwnFacebook(user)).toBe(false)
      expect((await payload.findByID({ collection: 'users', id: row.id, overrideAccess: true, select: { facebookLinkedAt: true } })).facebookLinkedAt).toBeTruthy()
      // The random placeholder is not a password anyone knows: the signed-in session chooses the first one.
      const session = await payload.login({ collection: 'users', data: { email: 'fb-only@example.com', password: 'placeholder-pass-2' } })
      ctl.headers = new Headers({ cookie: `payload-token=${session.token}`, 'sec-fetch-site': 'same-origin' })
      expect((await actions.changePasswordAction({}, form({ password: 'first-chosen-pass-1', confirm: 'first-chosen-pass-1' }))).ok).toMatch(/saved/)
      expect((await queries.getOwnAccount(user))?.hasPassword).toBe(true)
      expect((await payload.login({ collection: 'users', data: { email: 'fb-only@example.com', password: 'first-chosen-pass-1' } })).token).toBeTruthy()
      // From now on the current password is required, and the first-password route is closed.
      expect(await queries.chooseFirstPassword(user, 'sneaky-second-pass-1')).toBe(false)
      expect((await actions.changePasswordAction({}, form({ password: 'second-chosen-pass-1', confirm: 'second-chosen-pass-1' }))).error).toBeTruthy()
      expect(await queries.unlinkOwnFacebook(user)).toBe(true)
    })

    it('an editor changing their password here must also give the current one', async () => {
      await payload.create({ collection: 'users', data: { email: 'editor-pw@example.com', password: PASS, role: 'editor' }, context: ctx })
      await signedIn('editor-pw@example.com', PASS)
      expect((await actions.changePasswordAction({}, form({ password: 'editor-new-pass-1', confirm: 'editor-new-pass-1' }))).error).toBeTruthy()
      expect((await actions.changePasswordAction({}, form({ current: 'not-the-password', password: 'editor-new-pass-1', confirm: 'editor-new-pass-1' }))).error).toBeTruthy()
      await expect(payload.login({ collection: 'users', data: { email: 'editor-pw@example.com', password: 'editor-new-pass-1' } })).rejects.toThrow()
      expect((await actions.changePasswordAction({}, form({ current: PASS, password: 'editor-new-pass-1', confirm: 'editor-new-pass-1' }))).ok).toMatch(/changed/)
    })
  })
})
