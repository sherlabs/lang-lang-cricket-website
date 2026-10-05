import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest } from './helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)
const nav = vi.hoisted(() => ({ headers: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => nav.headers, cookies: async () => ({ get: () => undefined }) }))

const PASS = 'selector-pass-123'

/**
 * A selector is signed in but is not committee. For every collection and global in the config (and Payload's built-in ones),
 * what a selector can do over REST equals what an anonymous visitor can do, except an explicit allowlist. Fails when a new
 * collection appears without an owner deciding (announce-teams spec 3.9).
 */
describe('selector is not staff (access matrix)', () => {
  let payload: Payload
  let selectorToken: string
  let selectorId: number
  const seen = { announcements: 0 }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    const ctx = { seedAdmin: true, disableRevalidate: true }
    await payload.create({ collection: 'users', data: { email: 'admin@example.com', password: PASS, role: 'admin' }, context: ctx })
    const s = await payload.create({ collection: 'users', data: { email: 'sel@example.com', password: PASS, role: 'selector' }, context: ctx })
    selectorId = s.id as number
    selectorToken = (await rest('POST', '/users/login', { body: { email: 'sel@example.com', password: PASS } })).json.token
    // Rows an anonymous visitor must not see, and a selector must not see either.
    await clearCollection(payload, 'announcements')
    await payload.create({ collection: 'announcements', data: { title: 'Live', published: true }, context: { disableRevalidate: true } })
    await payload.create({ collection: 'announcements', data: { title: 'Draft', published: false }, context: { disableRevalidate: true } })
    seen.announcements = 1
    await payload.create({ collection: 'news', data: { title: 'Secret draft', status: 'draft' } as never, context: { disableRevalidate: true } }).catch(() => undefined)
    await payload.create({ collection: 'players', data: { firstName: 'Hidden', lastName: 'Player', displayName: 'Hidden Player', slug: 'hidden-player', hidden: true } as never, context: { disableRevalidate: true } }).catch(() => undefined)
  })
  afterAll(async () => {
    // Later files create their own users with the conventional `<role>@example.com` addresses and passwords.
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })

  const denied = (s: number) => s === 401 || s === 403
  // slug -> operations where a selector legitimately differs from anonymous.
  // users: self only (checked in selector-users.int); payload-preferences: own rows only (checked below).
  const ALLOW: Record<string, string[]> = {
    users: ['read', 'updateById', 'bulkUpdate'],
    'payload-preferences': ['read', 'create', 'updateById', 'bulkUpdate', 'deleteById', 'bulkDelete'],
  }

  it('every collection: a selector gets what an anonymous visitor gets', async () => {
    const mismatches: string[] = []
    for (const { slug } of payload.config.collections) {
      if (slug === 'payload-migrations') continue
      const ops: Record<string, () => Promise<{ status: number; json: unknown }>> = {
        read: () => rest('GET', `/${slug}?limit=50&depth=0`, {}),
        create: () => rest('POST', `/${slug}`, { body: {} }),
        updateById: () => rest('PATCH', `/${slug}/1`, { body: {} }),
        bulkUpdate: () => rest('PATCH', `/${slug}?where[id][exists]=true`, { body: {} }),
        deleteById: () => rest('DELETE', `/${slug}/1`),
        bulkDelete: () => rest('DELETE', `/${slug}?where[id][exists]=true`),
      }
      for (const [op, run] of Object.entries(ops)) {
        if (ALLOW[slug]?.includes(op)) continue
        const anon = await run()
        const sel = await (async () => {
          const withToken = {
            read: () => rest('GET', `/${slug}?limit=50&depth=0`, { token: selectorToken }),
            create: () => rest('POST', `/${slug}`, { body: {}, token: selectorToken }),
            updateById: () => rest('PATCH', `/${slug}/1`, { body: {}, token: selectorToken }),
            bulkUpdate: () => rest('PATCH', `/${slug}?where[id][exists]=true`, { body: {}, token: selectorToken }),
            deleteById: () => rest('DELETE', `/${slug}/1`, { token: selectorToken }),
            bulkDelete: () => rest('DELETE', `/${slug}?where[id][exists]=true`, { token: selectorToken }),
          } as const
          return withToken[op as keyof typeof withToken]()
        })()
        const sameDenial = denied(anon.status) && denied(sel.status)
        // A not-found on an id both are allowed to try is equal too; reads must return the very same rows.
        const sameRows = op === 'read' && anon.status === 200 && sel.status === 200 && JSON.stringify((anon.json as { docs: Array<{ id: number }> }).docs.map((d) => d.id)) === JSON.stringify((sel.json as { docs: Array<{ id: number }> }).docs.map((d) => d.id))
        const sameStatus = anon.status === sel.status && op !== 'read'
        if (!(sameDenial || sameRows || sameStatus)) mismatches.push(`${slug} ${op}: anonymous ${anon.status}, selector ${sel.status}`)
      }
    }
    expect(mismatches).toEqual([])
  }, 120_000)

  it('every global: reads and writes equal anonymous (except selection-settings, which selection users may read)', async () => {
    for (const { slug } of payload.config.globals) {
      const anonR = await rest('GET', `/globals/${slug}`)
      const selR = await rest('GET', `/globals/${slug}`, { token: selectorToken })
      if (slug === 'selection-settings') {
        expect({ slug, anon: denied(anonR.status), selector: selR.status }).toEqual({ slug, anon: true, selector: 200 })
      } else {
        expect({ slug, r: selR.status }).toEqual({ slug, r: anonR.status })
      }
      const anonW = await rest('POST', `/globals/${slug}`, { body: {} })
      const selW = await rest('POST', `/globals/${slug}`, { body: {}, token: selectorToken })
      expect({ slug, w: denied(selW.status), anon: denied(anonW.status) }).toEqual({ slug, w: true, anon: true })
    }
  })

  it('a selector sees no unpublished announcement, no hidden player', async () => {
    const list = await rest('GET', '/announcements?depth=0', { token: selectorToken })
    expect(list.json.docs.map((d: { title: string }) => d.title)).toEqual(['Live'])
    const players = await rest('GET', '/players?depth=0', { token: selectorToken })
    expect(players.json.docs.map((d: { slug: string }) => d.slug)).not.toContain('hidden-player')
  })

  it('Payload built-ins: a selector cannot touch edit locks or jobs, and sees only their own preferences', async () => {
    for (const slug of ['payload-locked-documents', 'payload-jobs']) {
      expect((await rest('GET', `/${slug}`, { token: selectorToken })).status, slug).toBeGreaterThanOrEqual(401)
      expect((await rest('POST', `/${slug}`, { token: selectorToken, body: {} })).status, slug).toBeGreaterThanOrEqual(401)
    }
    const adminLogin = (await rest('POST', '/users/login', { body: { email: 'admin@example.com', password: PASS } })).json
    await rest('POST', '/payload-preferences/probe', { token: adminLogin.token, body: { value: { secret: 'admin-only' } } })
    const mine = await rest('GET', '/payload-preferences?limit=50', { token: selectorToken })
    expect(JSON.stringify(mine.json)).not.toContain('admin-only')
  })

  it('/admin is closed to a selector (access.admin)', () => {
    const users = payload.config.collections.find((c) => c.slug === 'users')!
    expect((users.access!.admin as (a: { req: { user: unknown } }) => boolean)({ req: { user: { role: 'selector', id: selectorId } } })).toBe(false)
  })

  it('custom endpoints and routes refuse a selector (merge, history import, PlayHQ refresh, players sync, statlab/saved, draft preview)', async () => {
    const merge = await rest('POST', '/players/1/merge', { token: selectorToken, body: { targetId: 2 } })
    expect(denied(merge.status)).toBe(true)
    for (const path of ['/history-import/preview', '/history-import/commit', '/history-import/export']) {
      const res = await rest('POST', path, { token: selectorToken, body: {} })
      expect([401, 403, 404, 405], path).toContain(res.status)
    }
    const headers = { Authorization: `JWT ${selectorToken}`, Origin: payload.config.serverURL }
    const { POST: refresh } = await import('@/app/api/admin/playhq-refresh/route')
    expect(denied((await refresh(new Request('http://localhost:3000/api/admin/playhq-refresh', { method: 'POST', headers }))).status)).toBe(true)
    const { POST: sync } = await import('@/app/api/admin/players-sync/route')
    expect(denied((await sync(new Request('http://localhost:3000/api/admin/players-sync', { method: 'POST', headers }))).status)).toBe(true)
    const saved = await import('@/app/(frontend)/statlab/saved/route')
    expect(denied((await saved.GET(new Request('http://localhost:3000/statlab/saved', { headers }))).status)).toBe(true)
    expect(denied((await saved.POST(new Request('http://localhost:3000/statlab/saved', { method: 'POST', headers, body: '{}' }))).status)).toBe(true)
    nav.headers = new Headers({ Authorization: `JWT ${selectorToken}` })
    const { hasStaffSession } = await import('@/lib/preview-queries')
    expect(await hasStaffSession()).toBe(false)
    const admin = (await rest('POST', '/users/login', { body: { email: 'admin@example.com', password: PASS } })).json.token
    nav.headers = new Headers({ Authorization: `JWT ${admin}` })
    expect(await hasStaffSession()).toBe(true)
  })
})
