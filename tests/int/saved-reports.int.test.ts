/**
 * saved-reports.int (W2 spec 5.3): an admin-only bookmark list of canonical StatLab queries. Anonymous and
 * editor requests are refused over REST, the owner and slug are hook-owned, an invalid query is rejected,
 * a good one is stored in canonical form (unknown params dropped), and the list is capped at 200.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SAVED_REPORTS } from '@/lib/stats/saved-reports'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }))

let payload: Payload
let admin: string
let editor: string
let adminId: number

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await tokenFor(payload, 'admin')
  editor = await tokenFor(payload, 'editor')
  adminId = (await payload.find({ collection: 'users', where: { email: { equals: 'admin@example.com' } }, limit: 1, depth: 0 })).docs[0].id
})
afterAll(async () => {
  await clearCollection(payload, 'saved-reports')
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await clearCollection(payload, 'saved-reports')
})

const post = (token: string | undefined, body: Record<string, unknown>) => rest('POST', '/saved-reports', { token, body })

describe('saved reports over REST', () => {
  it('refuses anonymous and editor reads and writes', async () => {
    await payload.create({ collection: 'saved-reports', data: { title: 'Seeded', query: 'cols=runs,avg' }, context: { disableRevalidate: true } })
    for (const token of [undefined, editor]) {
      expect([401, 403]).toContain((await rest('GET', '/saved-reports', { token })).status)
      expect([401, 403]).toContain((await post(token, { title: 'x', query: 'cols=runs' })).status)
    }
    expect((await rest('GET', '/saved-reports', { token: admin })).json.docs).toHaveLength(1)
  })

  it('stamps the owner and a slug itself, ignoring REST input for both', async () => {
    const res = await post(admin, { title: 'Fifty makers', query: 'sort=fifties.desc&cols=runs,fifties&utm=1', owner: 999, slug: 'hijack' })
    expect(res.status).toBe(201)
    expect(res.json.doc.owner.id).toBe(adminId)
    expect(res.json.doc.slug).toBe('fifty-makers')
    // Canonical: unknown params dropped, keys sorted, defaults omitted.
    expect(res.json.doc.query).toBe('cols=runs,fifties&sort=fifties.desc')
  })

  it('gives a second report with the same title a different slug, and never changes a slug on edit', async () => {
    const a = await post(admin, { title: 'Same', query: 'cols=runs,avg' })
    const b = await post(admin, { title: 'Same', query: 'cols=runs,wickets' })
    expect(a.json.doc.slug).toBe('same')
    expect(b.json.doc.slug).toBe('same-2')
    const upd = await rest('PATCH', `/saved-reports/${b.json.doc.id}`, { token: admin, body: { title: 'Renamed' } })
    expect(upd.status).toBe(200)
    expect(upd.json.doc.slug).toBe('same-2')
  })

  it.each([
    ['not a query string', 'hello world'],
    ['an empty column set', 'cols=nope,alsoNope'],
    ['only defaults', 'scope=career'],
    ['script text', '<script>alert(1)</script>'],
    ['too long', `cols=runs&q=${'a'.repeat(2100)}`],
  ])('rejects %s', async (_n, query) => {
    const res = await post(admin, { title: 'Bad', query })
    expect(res.status).toBe(400)
    expect((await payload.count({ collection: 'saved-reports', overrideAccess: true })).totalDocs).toBe(0)
  })

  it('re-canonicalises on update and rejects a bad edit', async () => {
    const a = await post(admin, { title: 'Edit me', query: 'cols=runs,avg' })
    const ok = await rest('PATCH', `/saved-reports/${a.json.doc.id}`, { token: admin, body: { query: '/statlab?sort=avg.desc&cols=runs,avg' } })
    expect(ok.json.doc.query).toBe('cols=runs,avg&sort=avg.desc')
    expect((await rest('PATCH', `/saved-reports/${a.json.doc.id}`, { token: admin, body: { query: 'garbage' } })).status).toBe(400)
  })

  it('caps the list', async () => {
    const rows = Array.from({ length: MAX_SAVED_REPORTS }, (_, i) => ({ title: `R${i}`, query: `cols=runs&min.runs=${i + 1}` }))
    for (const r of rows) await payload.create({ collection: 'saved-reports', data: r, context: { disableRevalidate: true } })
    const over = await post(admin, { title: 'One too many', query: 'cols=runs,avg' })
    expect(over.status).toBe(400)
    expect(over.json.errors[0].message).toMatch(/room for 200/)
  }, 120_000)
})

describe('the /statlab/saved route', () => {
  const call = async (token: string | undefined, init: RequestInit = {}) => {
    const { GET, POST } = await import('@/app/(frontend)/statlab/saved/route')
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `JWT ${token}`)
    headers.set('origin', payload.config.csrf[0] as string)
    const req = new Request('http://localhost:3000/statlab/saved', { ...init, headers })
    return init.method === 'POST' ? POST(req) : GET(req)
  }

  it('answers signed-out visitors and editors with no list', async () => {
    expect((await call(undefined)).status).toBe(401)
    expect((await call(editor)).status).toBe(403)
    expect((await call(editor, { method: 'POST', body: JSON.stringify({ title: 'x', query: 'cols=runs,avg' }) })).status).toBe(403)
  })

  it('answers an anonymous POST with no Origin 401, and a foreign Origin 403', async () => {
    const { POST } = await import('@/app/(frontend)/statlab/saved/route')
    const body = JSON.stringify({ title: 'x', query: 'cols=runs,avg' })
    expect((await POST(new Request('http://localhost:3000/statlab/saved', { method: 'POST', body }))).status).toBe(401)
    expect((await POST(new Request('http://localhost:3000/statlab/saved', { method: 'POST', body, headers: { origin: 'https://evil.example' } }))).status).toBe(403)
  })

  it('refuses a report naming an opposition, season or grade that does not exist', async () => {
    const res = await call(admin, { method: 'POST', body: JSON.stringify({ title: 'Junk', query: 'cols=runs,fifties&opp=zzz' }) })
    expect(res.status).toBe(400)
  })

  it('saves and lists for an admin, with the canonical share link', async () => {
    const saved = await call(admin, { method: 'POST', body: JSON.stringify({ title: 'Mine', query: 'cols=runs,avg&sort=avg.desc' }) })
    expect(saved.status).toBe(201)
    const list = await (await call(admin)).json()
    expect(list.reports).toEqual([expect.objectContaining({ title: 'Mine', href: '/statlab?cols=runs,avg&sort=avg.desc', dropped: [] })])
    const bad = await call(admin, { method: 'POST', body: JSON.stringify({ title: 'Bad', query: 'nope' }) })
    expect(bad.status).toBe(400)
  })
})
