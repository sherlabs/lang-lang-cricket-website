import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload } from './helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

/**
 * The spike for minting a session without a password (spec 3.5.1). It imports from exactly the paths the implementation uses, so a
 * moved export fails here, and it pins the behaviour the rest of WP-A builds on. If a Payload upgrade breaks it, fix
 * `lib/selector-session.ts`, not this test.
 */
describe('selector session mint (Payload primitives)', () => {
  let payload: Payload
  const ids: Record<string, number> = {}
  // Cookie auth needs a same-origin signal (Origin or Sec-Fetch-Site) because `csrf` is non-empty.
  const cookieHeaders = (token: string) => new Headers({ cookie: `${payload.config.cookiePrefix}-token=${token}`, 'sec-fetch-site': 'same-origin' })

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    const ctx = { seedAdmin: true, disableRevalidate: true }
    for (const role of ['selector', 'editor', 'admin'] as const) {
      const u = await payload.create({ collection: 'users', data: { email: `${role}@example.com`, password: 'a-long-pass-123', role }, context: ctx })
      ids[role] = u.id as number
    }
  })
  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('the primitives exist at the pinned import paths and sessions are on', async () => {
    const root = await import('payload')
    const shared = await import('payload/shared')
    expect(typeof root.getFieldsToSign).toBe('function')
    expect(typeof root.jwtSign).toBe('function')
    expect(typeof root.resetLoginAttempts).toBe('function')
    expect(typeof shared.addSessionToUser).toBe('function')
    expect(typeof shared.generatePayloadCookie).toBe('function')
    expect(payload.collections.users.config.auth.useSessions).toBe(true)
  })

  it('mints a cookie that payload.auth accepts as the selector, with a fresh sid each time', async () => {
    const { mintSelectorSession } = await import('@/lib/selector-session')
    const a = await mintSelectorSession(payload, ids.selector, 'facebook')
    const b = await mintSelectorSession(payload, ids.selector, 'facebook')
    expect(a.cookie).toContain(`${payload.config.cookiePrefix}-token=`)
    expect(a.cookie).toMatch(/HttpOnly/i)
    expect(a.token).not.toBe(b.token)
    const auth = await payload.auth({ headers: cookieHeaders(a.token) })
    expect(auth.user?.role).toBe('selector')
    expect(auth.user?.id).toBe(ids.selector)
    const row = await payload.findByID({ collection: 'users', id: ids.selector, depth: 0 })
    expect(row.lastLoginMethod).toBe('facebook')
    expect(row.lastLoginAt).toBeTruthy()
  })

  it('clearing sessions invalidates the minted cookie (logout and revocation work unchanged)', async () => {
    const { mintSelectorSession } = await import('@/lib/selector-session')
    const { token } = await mintSelectorSession(payload, ids.selector, 'facebook')
    const headers = cookieHeaders(token)
    expect((await payload.auth({ headers })).user).toBeTruthy()
    await payload.db.updateOne({ collection: 'users', id: ids.selector, data: { sessions: [] }, returning: false })
    expect((await payload.auth({ headers })).user).toBeNull()
  })

  it('a selector cannot open /admin', async () => {
    const users = payload.config.collections.find((c) => c.slug === 'users')!
    const { mintSelectorSession } = await import('@/lib/selector-session')
    const { token } = await mintSelectorSession(payload, ids.selector, 'facebook')
    const { user } = await payload.auth({ headers: cookieHeaders(token) })
    expect((users.access!.admin as (a: { req: { user: unknown } }) => boolean)({ req: { user } })).toBe(false)
  })

  it('refuses to mint for staff or a disabled selector', async () => {
    const { mintSelectorSession, SessionMintError } = await import('@/lib/selector-session')
    await expect(mintSelectorSession(payload, ids.editor, 'facebook')).rejects.toBeInstanceOf(SessionMintError)
    await expect(mintSelectorSession(payload, ids.admin, 'facebook')).rejects.toBeInstanceOf(SessionMintError)
    await payload.update({ collection: 'users', id: ids.selector, data: { disabled: true }, context: { disableRevalidate: true } })
    await expect(mintSelectorSession(payload, ids.selector, 'facebook')).rejects.toBeInstanceOf(SessionMintError)
    await payload.update({ collection: 'users', id: ids.selector, data: { disabled: false }, context: { disableRevalidate: true } })
  })
})
