import { redirect } from 'next/navigation'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { loginBounceNotice } from '@/payload/admin/login-bounce-guard'
import type { SessionCheck } from '@/payload/admin/session-check'

const payload = { secret: 's', config: { cookiePrefix: 'club', csrf: [], routes: { admin: '/admin' }, admin: { routes: { login: '/login', unauthorized: '/unauthorized' } } }, collections: {}, findByID: vi.fn() } as never
const cookie = new Headers({ cookie: 'club-token=abc' })
const thrown = (url: string) => { try { redirect(url) } catch (e) { return e } throw new Error('redirect did not throw') }
const check = (out: SessionCheck) => vi.fn(async () => out)

describe('loginBounceNotice (Payload pages: Home, lists, edit forms)', () => {
  const toLogin = () => thrown('/admin/login?redirect=%2Fadmin%2Fcollections%2Fnews%3Fpage%3D2')

  it('returns the calm notice when Payload redirected to login but the sign-in check failed', async () => {
    const out = await loginBounceNotice({ error: toLogin(), payload, headers: cookie, check: check({ outcome: 'error', reason: 'timeout' }) })
    const html = renderToStaticMarkup(out as never)
    expect(html).toContain('data-admin-notice="auth-trouble"')
    expect(html).toContain('href="/admin/collections/news?page=2"') // reload goes back to the same page
  })

  it('also keeps a signed-in person off the login page when the second look finds a valid session', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await loginBounceNotice({ error: toLogin(), payload, headers: cookie, check: check({ outcome: 'valid', user: { id: 1, role: 'editor' } }) })
    expect(renderToStaticMarkup(out as never)).toContain('data-admin-notice="auth-trouble"')
    // The log line uses the shared schema: a known session value, the route without its query, no personal data.
    expect(JSON.parse(String(warn.mock.calls[0]![0]))).toEqual({ evt: 'admin.render', route: '/admin/collections/news', authMs: 0, themeMs: null, viewMs: 0, session: 'retried-ok' })
    warn.mockRestore()
  })

  it('shows a signed-in selector the committee-only page (with the selector link) on Payload\'s own redirects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const error of [thrown('/admin/unauthorized'), toLogin()]) {
      const html = renderToStaticMarkup((await loginBounceNotice({ error, payload, headers: cookie, check: check({ outcome: 'valid', user: { id: 2, role: 'selector' } }) })) as never)
      expect(html).toContain('This part of the admin is for the committee.')
      expect(html).toContain('href="/selector"')
    }
    // A signed-in person who is not a selector gets the page without the selector link.
    const other = renderToStaticMarkup((await loginBounceNotice({ error: thrown('/admin/unauthorized'), payload, headers: cookie, check: check({ outcome: 'valid', user: { id: 3, role: 'member' } }) })) as never)
    expect(other).not.toContain('href="/selector"')
  })

  it('leaves Payload\'s unauthorized redirect alone for a committee member and for a signed-out cookie', async () => {
    expect(await loginBounceNotice({ error: thrown('/admin/unauthorized'), payload, headers: cookie, check: check({ outcome: 'valid', user: { id: 1, role: 'editor' } }) })).toBeNull()
    expect(await loginBounceNotice({ error: thrown('/admin/unauthorized'), payload, headers: cookie, check: check({ outcome: 'signed-out', reason: 'no-session' }) })).toBeNull()
  })

  it('lets the redirect through when the visitor really is signed out', async () => {
    expect(await loginBounceNotice({ error: toLogin(), payload, headers: cookie, check: check({ outcome: 'signed-out', reason: 'bad-token' }) })).toBeNull()
  })

  it('does nothing without a cookie, for other redirects, and for other errors', async () => {
    const c = check({ outcome: 'error', reason: 'timeout' })
    expect(await loginBounceNotice({ error: toLogin(), payload, headers: new Headers(), check: c })).toBeNull()
    expect(await loginBounceNotice({ error: thrown('/admin'), payload, headers: cookie, check: c })).toBeNull()
    expect(await loginBounceNotice({ error: new Error('boom'), payload, headers: cookie, check: c })).toBeNull()
    expect(c).not.toHaveBeenCalled()
  })

  it('never reflects an unsafe redirect target', async () => {
    const out = await loginBounceNotice({ error: thrown('/admin/login?redirect=%2F%2Fevil.test'), payload, headers: cookie, check: check({ outcome: 'error', reason: 'timeout' }) })
    expect(renderToStaticMarkup(out as never)).not.toContain('evil.test')
  })
})
