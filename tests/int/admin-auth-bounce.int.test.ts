/**
 * admin-auth-bounce.int (wave G WP-0, spec section 2 "Tests"): turns the audit's hypothesis 2 into evidence.
 *
 * The chain under test is the real one: a valid session cookie, Payload's own `payload.auth` (which swallows any error thrown by
 * the session lookup and answers `user: null`), then the custom view's gate. The only fake is that `findByID` throws once,
 * standing in for a timeout or an exhausted connection pool.
 */
import type { Payload } from 'payload'
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

describe('a failed session lookup with a valid cookie (characterisation)', () => {
  it('Payload answers "no user" when the lookup throws, and the old gate then bounces to the login page', async () => {
    const token = await tokenFor(payload, 'editor')
    const headers = cookieHeaders(token)

    // Control: the same cookie signs in when the lookup works.
    const ok = await payload.auth({ headers })
    expect(ok.user?.role).toBe('editor')

    vi.spyOn(payload, 'findByID').mockRejectedValueOnce(new Error('connection terminated due to connection timeout'))
    const failed = await payload.auth({ headers })
    expect(failed.user).toBeNull()

    const { requireUser } = await import('@/payload/components/AdminPage')
    let digest = ''
    try {
      requireUser({ initPageResult: { req: { user: failed.user, payload } } } as never, '/social')
    } catch (err) {
      digest = String((err as { digest?: string }).digest ?? '')
    }
    expect(digest).toContain('NEXT_REDIRECT')
    expect(decodeURIComponent(digest)).toContain('/admin/login?redirect=/admin/social')
  })
})
