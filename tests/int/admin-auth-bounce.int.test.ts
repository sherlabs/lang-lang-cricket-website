/**
 * admin-auth-bounce.int (wave G WP-0, spec section 2 "Tests").
 *
 * Step 1 (commit dc239cb) proved the audit's hypothesis against the old gate: with a valid session cookie, a session lookup that
 * throws makes Payload answer `user: null` (`executeAuthStrategies` swallows the error), and the old `requireUser` then redirected
 * to the login page, which succeeded and redirected straight back. This file is step 2: the same chain against `requireStaff`.
 *
 * The chain is the real one (a valid cookie, Payload's own `payload.auth`, then the view's gate). The only fake is that `findByID`
 * throws once, standing in for a timeout or an exhausted connection pool.
 */
import type { Payload } from 'payload'
import { SignJWT } from 'jose'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { destroyTestPayload, getTestPayload, tokenFor, wipeTestData } from './helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }))

let payload: Payload
beforeAll(async () => {
  payload = await getTestPayload()
})
afterEach(() => vi.restoreAllMocks())
afterAll(async () => {
  await wipeTestData(payload)
  await destroyTestPayload(payload)
})

const cookieHeaders = (token: string) => new Headers({ cookie: `${payload.config.cookiePrefix}-token=${token}`, 'sec-fetch-site': 'same-origin' })

const gate = async (user: unknown, headers: Headers, searchParams: Record<string, string> = {}) => {
  const { requireStaff } = await import('@/payload/components/AdminPage')
  const view = { initPageResult: { req: { user, headers, payload } }, searchParams } as never
  try {
    return { result: await requireStaff(view, '/social'), digest: '' }
  } catch (err) {
    return { result: null, digest: decodeURIComponent(String((err as { digest?: string }).digest ?? '')) }
  }
}

describe('a failed session lookup with a valid cookie', () => {
  it('shows the "could not check" notice (HTTP 200, no redirect) instead of bouncing to the login page', async () => {
    const headers = cookieHeaders(await tokenFor(payload, 'editor'))
    expect((await payload.auth({ headers })).user?.role).toBe('editor') // control: the cookie signs in when the lookup works

    // The first lookup (Payload's own) throws, which Payload turns into "no user"; the gate's own second look throws as well.
    const lookup = vi.spyOn(payload, 'findByID').mockRejectedValue(new Error('connection terminated due to connection timeout'))
    const { user } = await payload.auth({ headers })
    expect(user).toBeNull()
    const out = await gate(user, headers, { type: 'sponsor-thanks', source: '1,2' })
    lookup.mockRestore()

    expect(out.digest).toBe('')
    const html = renderToStaticMarkup(out.result as never)
    expect(html).toContain('data-admin-notice="auth-trouble"')
    expect(html).toContain('We could not check that you are signed in')
    expect(html).toContain('href="/admin/social?type=sponsor-thanks&amp;source=1%2C2"') // Reload keeps the deep link
    expect(html).toContain('href="/admin/login?redirect=%2Fadmin%2Fsocial%3Ftype%3Dsponsor-thanks%26source%3D1%252C2"')
  })

  it('lets the committee member through when only the first lookup failed (one extra attempt, then continue)', async () => {
    const headers = cookieHeaders(await tokenFor(payload, 'editor'))
    vi.spyOn(payload, 'findByID').mockRejectedValueOnce(new Error('pool exhausted'))
    const { user } = await payload.auth({ headers })
    expect(user).toBeNull()
    const findByID = vi.spyOn(payload, 'findByID')
    const out = await gate(user, headers)
    expect(out.digest).toBe('')
    expect(out.result).toBeNull() // proceed
    expect(findByID).toHaveBeenCalledTimes(1) // at most one extra read
  })

  it('never looks anything up for a visitor with no cookie, and redirects to the login page carrying the allowlisted query', async () => {
    const findByID = vi.spyOn(payload, 'findByID')
    const out = await gate(null, new Headers(), { type: 'sponsor-thanks', source: '1,2', notice: 'hacked', evil: '//evil.test' })
    expect(findByID).not.toHaveBeenCalled()
    expect(out.digest).toContain('NEXT_REDIRECT')
    expect(out.digest).toContain('/admin/login?redirect=/admin/social?type=sponsor-thanks&source=1%2C2')
    expect(out.digest).not.toContain('evil')
    expect(out.digest).not.toContain('notice')
  })

  it('treats an expired token as signed out (login redirect), never as a failed check', async () => {
    const stale = await new SignJWT({ id: 1, collection: 'users', sid: 'gone' })
      .setProtectedHeader({ alg: 'HS256', authVersion: 1 })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(payload.secret))
    const out = await gate(null, cookieHeaders(stale))
    expect(out.result).toBeNull()
    expect(out.digest).toContain('/admin/login?redirect=/admin/social')
  })

  it('treats a cookie whose session was removed as signed out', async () => {
    const token = await tokenFor(payload, 'editor')
    const { user } = await payload.auth({ headers: cookieHeaders(token) })
    await payload.update({ collection: 'users', id: user!.id, data: { sessions: [] }, overrideAccess: true, context: { disableRevalidate: true } })
    const out = await gate(null, cookieHeaders(token))
    expect(out.digest).toContain('/admin/login?redirect=')
  })
})

describe('a signed-in person who is not on the committee', () => {
  it('sees the notice without a redirect, with the selector link only for a selector', async () => {
    const selectorHeaders = cookieHeaders(await tokenFor(payload, 'selector'))
    const selector = (await payload.auth({ headers: selectorHeaders })).user
    const forSelector = await gate(selector, selectorHeaders)
    expect(forSelector.digest).toBe('')
    const html = renderToStaticMarkup(forSelector.result as never)
    expect(html).toContain('This part of the admin is for the committee.')
    expect(html).toContain('href="/selector"')
    expect(html).toContain('/admin/logout')

    const disabled = await gate({ id: 9, role: 'editor', disabled: true }, new Headers())
    expect(disabled.digest).toBe('')
    const plain = renderToStaticMarkup(disabled.result as never)
    expect(plain).toContain('This part of the admin is for the committee.')
    expect(plain).not.toContain('/selector')
  })
})
