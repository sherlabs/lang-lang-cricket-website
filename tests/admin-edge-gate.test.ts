import { createHash } from 'node:crypto'
import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { anonymousAdminRedirect } from '@/lib/admin/edge-gate'
import { SESSION_COOKIE_PREFIX } from '@/lib/admin/cookie-prefix'

const SECRET = 'test-secret-for-edge-gate'
const key = new TextEncoder().encode(createHash('sha256').update(SECRET).digest('hex').slice(0, 32))
const token = (exp: number | string = '1h', claims: Record<string, unknown> = { id: 1, collection: 'users', sid: 's' }, version = 1) =>
  new SignJWT(claims).setProtectedHeader({ alg: 'HS256', authVersion: version } as never).setExpirationTime(exp).sign(key)
const run = (over: Partial<Parameters<typeof anonymousAdminRedirect>[0]> = {}) =>
  anonymousAdminRedirect({ method: 'GET', pathname: '/admin/social', search: '?type=sponsor-thanks&source=13%2C17&notice=x', cookieHeader: null, secret: SECRET, ...over })

describe('admin front gate (real 307 for signed-out visitors)', () => {
  it('sends no cookie to the login page with the allowlisted return path and without flash keys', async () => {
    const to = await run()
    expect(to).toBe('/admin/login?redirect=' + encodeURIComponent('/admin/social?type=sponsor-thanks&source=13%2C17'))
  })

  it('treats garbage, tampered, expired, wrong-scheme and incomplete tokens as signed out', async () => {
    const good = await token()
    const cases = ['payload-token=garbage', `payload-token=${good.slice(0, -3)}abc`, `payload-token=${await token(Math.floor(Date.now() / 1000) - 60)}`, `payload-token=${await token('1h', undefined, 2)}`, `payload-token=${await token('1h', { id: 1 })}`]
    for (const cookieHeader of cases) expect(await run({ cookieHeader })).toContain('/admin/login?redirect=')
  })

  it('lets a verifying token through (revocation is decided by the page) and HEAD is treated like GET', async () => {
    const cookieHeader = `a=b; payload-token=${await token()}`
    expect(await run({ cookieHeader })).toBeNull()
    expect(await run({ method: 'HEAD' })).toContain('/admin/login')
  })

  it('leaves the account pages, other methods, other paths and a missing secret alone', async () => {
    for (const pathname of ['/admin/login', '/admin/logout', '/admin/forgot', '/admin/reset/abc', '/admin/create-first-user', '/admin/unauthorized']) expect(await run({ pathname })).toBeNull()
    expect(await run({ method: 'POST' })).toBeNull()
    expect(await run({ pathname: '/administrator' })).toBeNull()
    expect(await run({ secret: undefined })).toBeNull()
  })

  it('keeps the admin home as a plain return path', async () => {
    expect(await run({ pathname: '/admin', search: '' })).toBe('/admin/login?redirect=' + encodeURIComponent('/admin'))
  })
})

describe('cookie prefix is shared with Payload', () => {
  it('payload.config.ts sets cookiePrefix from the same constant the gate reads, and nothing else', () => {
    const config = readFileSync(path.resolve(__dirname, '../payload.config.ts'), 'utf8')
    expect(config).toMatch(/cookiePrefix:\s*SESSION_COOKIE_PREFIX\b/)
    expect(config).toMatch(/import \{ SESSION_COOKIE_PREFIX \} from '\.\/lib\/admin\/cookie-prefix'/)
    expect(config.match(/cookiePrefix\s*:/g)).toHaveLength(1)
  })
  it('the gate accepts a token under that prefix', async () => {
    expect(await run({ cookieHeader: `${SESSION_COOKIE_PREFIX}-token=${await token()}` })).toBeNull()
  })
})
