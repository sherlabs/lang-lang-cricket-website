import { sql } from '@payloadcms/db-postgres/drizzle'
import { handleEndpoints, type Payload } from 'payload'
import config from '@payload-config'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, tokenFor } from './helpers'

// Mail on for this file only (isolate.ts clears these before the next file). The mock provider makes no network call.
vi.hoisted(() => {
  process.env.EMAIL_PROVIDER = 'mock'
  process.env.EMAIL_FROM_ADDRESS = 'club@example.org'
  process.env.TRUSTED_IP_HEADER = 'x-test-ip'
})
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))

import { mockMail } from '@/lib/email/adapters/mock'
import { isSelectorUser, isStaffUser } from '@/payload/access'

/**
 * Password reset by email (wave D WP-6 spec 9.5): off without mail, the same answer for a known and an unknown address, the send
 * after the reply, the link built from the configured address whatever Host says, throttled, and the blocking acceptance test:
 * a selector can reset a password and still is a selector with no way into the admin.
 */
const ORIGIN = 'http://localhost:3000'
const wait = async (ok: () => boolean, ms = 3000) => {
  const end = Date.now() + ms
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 20))
}

describe('forgot and reset password', () => {
  let payload: Payload

  const call = async (path: string, body: unknown, headers: Record<string, string> = {}, url = ORIGIN) => {
    const request = new Request(`${url}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const res = await handleEndpoints({ config, request })
    const text = await res.text()
    return { status: res.status, text, json: (() => { try { return JSON.parse(text) } catch { return null } })() as { message?: string; errors?: { message: string }[] } | null }
  }
  const forgot = (email: string, headers: Record<string, string> = {}, url = ORIGIN) => call('/users/forgot-password', { email }, headers, url)
  const tokenOf = (text: string) => /\/admin\/reset\/([0-9a-f]+)/.exec(text)![1]
  const reset = async () => {
    await clearCollection(payload, 'throttle-hits')
    // Payload also ignores a second request for the same account within 15 seconds; each test starts outside that window.
    await payload.db.drizzle.execute(sql`UPDATE "payload"."users" SET reset_password_requested_at = NULL`)
    mockMail.reset()
    vi.unstubAllEnvs()
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    await tokenFor(payload, 'admin')
    await tokenFor(payload, 'editor')
    await tokenFor(payload, 'selector', 'picker@example.com')
  }, 120_000)
  afterAll(async () => {
    await clearCollection(payload, 'throttle-hits')
    await clearCollection(payload, 'users')
    for (const k of ['EMAIL_PROVIDER', 'EMAIL_FROM_ADDRESS', 'TRUSTED_IP_HEADER']) delete process.env[k]
    await destroyTestPayload(payload)
  })
  beforeEach(reset)

  it('is refused while mail is off, and nothing is sent', async () => {
    vi.stubEnv('EMAIL_PROVIDER', '')
    const res = await forgot('admin@example.com')
    expect(res.status).toBe(403)
    expect(res.json?.errors?.[0].message).toMatch(/not available/)
    expect(mockMail.calls()).toBe(0)
  })

  it('has the mail adapter wired in when mail is on', () => {
    expect(payload.email.name).toBe('club-email')
  })

  it('answers the same for a known and an unknown address, and only the known one is mailed', async () => {
    const known = await forgot('admin@example.com')
    const unknown = await forgot('nobody-here@example.com')
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(known.status)
    expect(unknown.text).toBe(known.text)
    await wait(() => mockMail.sent().length >= 1)
    expect(mockMail.sent()).toHaveLength(1)
    const m = mockMail.sent()[0]
    expect(m.to).toBe('admin@example.com')
    expect(m.from.address).toBe('club@example.org')
    // Transactional: the club's look, no marketing footer, no unsubscribe machinery, not subject to the list.
    expect(m.headers).toBeUndefined()
    expect(m.html + m.text).not.toMatch(/unsubscribe/i)
    expect(m.text).toContain(`${ORIGIN}/admin/reset/`)
  })

  it('returns before the send happens', async () => {
    const release = mockMail.hold()
    const started = Date.now()
    const res = await Promise.race([forgot('admin@example.com'), new Promise<'late'>((r) => setTimeout(() => r('late'), 4000))])
    expect(res).not.toBe('late')
    expect((res as { status: number }).status).toBe(200)
    expect(Date.now() - started).toBeLessThan(4000)
    expect(mockMail.sent()).toHaveLength(0)
    release()
    await wait(() => mockMail.sent().length === 1)
    expect(mockMail.sent()).toHaveLength(1)
  })

  it('builds the link from the configured address, whatever Host or X-Forwarded-Host say', async () => {
    const res = await forgot('admin@example.com', { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example', Origin: 'https://evil.example' }, 'https://evil.example')
    expect(res.status).toBe(200)
    await wait(() => mockMail.sent().length === 1)
    const m = mockMail.sent()[0]
    expect(m.text).toContain(`${ORIGIN}/admin/reset/`)
    expect(m.html + m.text).not.toContain('evil.example')
  })

  it('is throttled per address and per caller, with the same answer for an unknown address', async () => {
    for (let i = 0; i < 3; i++) expect((await forgot('ghost@example.com')).status).toBe(200)
    const blocked = await forgot('ghost@example.com')
    expect(blocked.status).toBe(429)
    // A known address is throttled in the same way, so the refusal reveals nothing.
    for (let i = 0; i < 3; i++) await forgot('editor@example.com')
    expect((await forgot('editor@example.com')).status).toBe(429)
    // Per caller: different addresses, one IP.
    for (let i = 0; i < 10; i++) expect((await forgot(`g${i}@example.com`, { 'x-test-ip': '198.51.100.1' })).status).toBe(200)
    expect((await forgot('g99@example.com', { 'x-test-ip': '198.51.100.1' })).status).toBe(429)
    expect((await forgot('g100@example.com', { 'x-test-ip': '198.51.100.2' })).status).toBe(200)
  })

  it('sends nothing to a disabled account, and says nothing about it', async () => {
    await payload.create({ collection: 'users', data: { email: 'off@example.com', password: 'off-pass-12345', role: 'editor', disabled: true } as never, context: { seedAdmin: true, disableRevalidate: true } })
    const a = await forgot('off@example.com')
    const b = await forgot('nobody-here@example.com')
    expect(a.status).toBe(b.status)
    expect(a.text).toBe(b.text)
    await new Promise((r) => setTimeout(r, 200))
    expect(mockMail.sent()).toHaveLength(0)
  })

  describe('selector accounts (blocking acceptance test)', () => {
    it('a selector resets their password and is still a selector who cannot open the admin', async () => {
      await forgot('picker@example.com')
      await wait(() => mockMail.sent().length === 1)
      const token = tokenOf(mockMail.sent()[0].text)

      // Too short: refused, and the token is not spent.
      const short = await call('/users/reset-password', { token, password: 'short' })
      expect(short.status).toBe(400)

      // The reset takes a password and nothing else: a role, an email or any other field in the request changes nothing.
      const done = await call('/users/reset-password', { token, password: 'a-brand-new-pass-1', role: 'admin', email: 'evil@example.com', disabled: false, facebookId: '123' })
      expect(done.status).toBe(200)

      const stored = (await payload.find({ collection: 'users', where: { email: { equals: 'picker@example.com' } }, depth: 0, overrideAccess: true, limit: 1 })).docs[0] as { role: string; email: string; facebookId?: string | null }
      expect(stored).toMatchObject({ role: 'selector', email: 'picker@example.com' })
      expect(stored.facebookId ?? null).toBeNull()
      expect(await payload.count({ collection: 'users', where: { email: { equals: 'evil@example.com' } }, overrideAccess: true })).toMatchObject({ totalDocs: 0 })

      // The old password is dead; the new one signs in; the role is still selector.
      await expect(payload.login({ collection: 'users', data: { email: 'picker@example.com', password: 'selector-pass-123' } })).rejects.toThrow()
      const login = await payload.login({ collection: 'users', data: { email: 'picker@example.com', password: 'a-brand-new-pass-1' } })
      expect((login.user as { role: string }).role).toBe('selector')
      expect(isSelectorUser(login.user as never)).toBe(true)
      expect(isStaffUser(login.user as never)).toBe(false)

      // The admin refuses a selector (staff guard), and the token cannot be used a second time.
      const users = payload.config.collections.find((c) => c.slug === 'users')!
      const adminAccess = users.access.admin as (a: { req: { user: unknown } }) => boolean
      expect(adminAccess({ req: { user: login.user } })).toBe(false)
      expect((await call('/users/reset-password', { token, password: 'another-new-pass-2' })).status).toBe(403)

      // An admin session (cookie auth) is a different matter: the same selector token cannot reach /admin through REST either.
      const me = await handleEndpoints({ config, request: new Request(`${ORIGIN}/api/users/me`, { headers: { Authorization: `JWT ${login.token}` } }) })
      expect(((await me.json()) as { user?: { role?: string } }).user?.role).toBe('selector')
    })

    it('a reset for an editor keeps them an editor', async () => {
      await forgot('editor@example.com')
      await wait(() => mockMail.sent().length === 1)
      const token = tokenOf(mockMail.sent()[0].text)
      expect((await call('/users/reset-password', { token, password: 'editor-new-pass-1', role: 'admin' })).status).toBe(200)
      const login = await payload.login({ collection: 'users', data: { email: 'editor@example.com', password: 'editor-new-pass-1' } })
      expect((login.user as { role: string }).role).toBe('editor')
    })
  })
})
