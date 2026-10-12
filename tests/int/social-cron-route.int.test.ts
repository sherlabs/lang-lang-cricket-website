/**
 * Wave C WP-2: the cron route (secret check, heartbeat, publishing through the Test network only) and the signed picture route
 * (signature before any lookup, revision, the grace period), against real Postgres. Nothing leaves the machine.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockControl } from '@/lib/social/adapters/mock'
import { imagePath } from '@/lib/social/image-url'
import { heartbeatView, overdueAfterMinutes } from '@/lib/social/heartbeat-math'
import { readHeartbeat } from '@/lib/social/heartbeat'
import { clearCollection, destroyTestPayload, getTestPayload, resetGlobal, tokenFor } from './helpers'
import { insertPost, postRow, q, resetQueue, targetRows } from './social-queue-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)

const dims = (buf: Buffer) => [buf.readUInt32BE(16), buf.readUInt32BE(20)]

describe('social cron and picture routes', () => {
  let payload: Payload
  let editorId: number

  const cron = async (header?: string) => {
    const { GET } = await import('@/app/api/cron/social-posts/route')
    return GET(new Request('http://localhost:3000/api/cron/social-posts', { headers: header ? { authorization: header } : {} }))
  }
  const image = async (path: string) => {
    const { GET } = await import('@/app/api/social/image/[postId]/[size]/route')
    const m = /image\/(\d+)\/([a-z]+)/.exec(path)!
    return GET(new Request(`http://localhost:3000${path}`), { params: Promise.resolve({ postId: m[1], size: m[2] }) })
  }
  const settingsRow = async () => (await q(payload, sql`SELECT * FROM "payload"."social_settings" ORDER BY id LIMIT 1`))[0]

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    await tokenFor(payload, 'editor')
    editorId = (await payload.find({ collection: 'users', where: { email: { equals: 'editor@example.com' } }, limit: 1, depth: 0 })).docs[0].id
  }, 120_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    delete process.env.CRON_SECRET
    delete process.env.SOCIAL_MOCK_NETWORK
    await resetQueue(payload)
    await clearCollection(payload, 'users')
    await resetGlobal(payload, 'social-settings')
    await destroyTestPayload(payload)
  })

  beforeEach(async () => {
    mockControl.reset()
    process.env.CRON_SECRET = 'local-test'
    delete process.env.SOCIAL_MOCK_NETWORK
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => { throw new Error(`unexpected outbound call to ${String(input)}`) })
    await resetQueue(payload)
    await resetGlobal(payload, 'social-settings')
  })

  describe('cron route', () => {
    it('answers 401 with no work and no heartbeat for no secret, a wrong secret, or an unset CRON_SECRET', async () => {
      const post = await insertPost(payload, { approvedBy: editorId })
      process.env.SOCIAL_MOCK_NETWORK = 'yes'
      for (const h of [undefined, 'Bearer wrong', 'Bearer ', 'Basic local-test']) expect((await cron(h)).status).toBe(401)
      delete process.env.CRON_SECRET
      for (const h of [undefined, 'Bearer undefined', 'Bearer ', 'Bearer local-test']) expect((await cron(h)).status).toBe(401)
      expect((await postRow(payload, post.id)).status).toBe('scheduled')
      expect(mockControl.calls).toHaveLength(0)
      expect(await settingsRow()).toBeUndefined()
    })

    it('with no network available it does nothing to the posts but still records the heartbeat', async () => {
      const post = await insertPost(payload, { approvedBy: editorId })
      const res = await cron('Bearer local-test')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ configured: [], claimed: 0 })
      expect((await postRow(payload, post.id)).status).toBe('scheduled')
      expect((await settingsRow()).last_cron_run_at).not.toBeNull()
    })

    it('with nothing due it returns 200, claims nothing, and writes the heartbeat and an observed interval on the second run', async () => {
      process.env.SOCIAL_MOCK_NETWORK = 'yes'
      const res = await cron('Bearer local-test')
      expect(await res.json()).toMatchObject({ configured: ['mock'], claimed: 0, posts: [] })
      const first = await settingsRow()
      expect(first.last_cron_run_at).not.toBeNull()
      expect(first.observed_cron_interval_minutes).toBeNull()
      await q(payload, sql`UPDATE "payload"."social_settings" SET last_cron_run_at = now() - interval '10 minutes' RETURNING id`)
      await cron('Bearer local-test')
      expect(Number((await settingsRow()).observed_cron_interval_minutes)).toBe(10)
    })

    it('publishes what is due through the Test network, once, even when run twice at the same time', async () => {
      process.env.SOCIAL_MOCK_NETWORK = 'yes'
      const post = await insertPost(payload, { approvedBy: editorId })
      const [a, b] = await Promise.all([cron('Bearer local-test'), cron('Bearer local-test')])
      expect([a.status, b.status]).toEqual([200, 200])
      expect(mockControl.calls).toHaveLength(1)
      expect((await postRow(payload, post.id)).status).toBe('published')
      const t = (await targetRows(payload, post.id))[0]
      expect(t.status).toBe('published')
      expect(String(t.remote_id)).toMatch(/^mock-/)
      const body = JSON.stringify(await (await cron('Bearer local-test')).json())
      expect(body).not.toContain('Final words') // ids and statuses only
    }, 60_000)

    it('reports a scheduled post as overdue by more than twice the observed interval', async () => {
      await insertPost(payload, { approvedBy: editorId, nextRunAt: new Date(Date.now() - 3 * 3_600_000).toISOString() })
      await resetGlobal(payload, 'social-settings')
      await payload.updateGlobal({ slug: 'social-settings', data: {}, overrideAccess: true })
      await q(payload, sql`UPDATE "payload"."social_settings" SET last_cron_run_at = now() - interval '3 hours', observed_cron_interval_minutes = 10 RETURNING id`)
      const facts = await readHeartbeat(payload, overdueAfterMinutes)
      expect(facts).toMatchObject({ scheduledCount: 1, overdueCount: 1, observedMinutes: 10 })
      const view = heartbeatView({ ...facts, now: new Date() })
      expect(view.warning).toMatch(/not going out/)
      expect(view.lastChecked).toBe('Last checked 3 hours ago')
      // A post that is only a little late (inside twice the interval) is not overdue.
      await q(payload, sql`UPDATE "payload"."social_posts" SET next_run_at = now() - interval '5 minutes' RETURNING id`)
      expect((await readHeartbeat(payload, overdueAfterMinutes)).overdueCount).toBe(0)
    })
  })

  describe('signed picture route', () => {
    const link = (postId: number, over: { size?: 'square' | 'story' | 'landscape'; revision?: number; hours?: number } = {}) => {
      const exp = Math.floor(Date.now() / 1000) + (over.hours ?? 1) * 3600
      return imagePath({ postId, size: over.size ?? 'square', revision: over.revision ?? 1, exp })
    }

    it('serves the approved picture of a scheduled post as a PNG, in each size', async () => {
      const { id } = await insertPost(payload, { approvedBy: editorId })
      for (const [size, want] of [['square', [1080, 1080]], ['story', [1080, 1920]], ['landscape', [1200, 630]]] as const) {
        const res = await image(link(id, { size }))
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toBe('private, no-store')
        expect(res.headers.get('x-robots-tag')).toBe('noindex')
        expect(dims(Buffer.from(await res.arrayBuffer()))).toEqual(want)
      }
    }, 90_000)

    it('still serves a finished post for the grace period, then answers 404', async () => {
      const { id } = await insertPost(payload, { status: 'published', approvedBy: editorId })
      await q(payload, sql`UPDATE "payload"."social_posts" SET finished_at = now() - interval '5 minutes' WHERE id = ${id} RETURNING id`)
      expect((await image(link(id))).status).toBe(200)
      await q(payload, sql`UPDATE "payload"."social_posts" SET finished_at = now() - interval '20 minutes' WHERE id = ${id} RETURNING id`)
      expect((await image(link(id))).status).toBe(404)
    }, 60_000)

    it('answers the same plain 404 for a tampered, expired, edited or draft link, and for an unknown post', async () => {
      const { id } = await insertPost(payload, { approvedBy: editorId })
      const draft = await insertPost(payload, { status: 'draft' })
      const good = link(id)
      expect((await image(good)).status).toBe(200)
      const shape = async (r: Response) => ({ status: r.status, body: await r.text(), cache: r.headers.get('cache-control'), robots: r.headers.get('x-robots-tag') })
      const expected = await shape(await image(`/api/social/image/${id}/square?rev=1&exp=1&sig=${'0'.repeat(64)}`))
      expect(expected.status).toBe(404)
      const edited = link(id, { revision: 1 })
      await q(payload, sql`UPDATE "payload"."social_posts" SET revision = 2 WHERE id = ${id} RETURNING id`) // an edit bumps the revision
      for (const path of [
        good.replace(/sig=[0-9a-f]+/, `sig=${'a'.repeat(64)}`), good.replace('/square', '/story'), link(id, { hours: -1 }), edited, link(draft.id), link(999999),
        good.replace(/sig=[0-9a-f]+/, 'sig=short'), good.replace(/&sig=.*/, ''),
      ]) expect(await shape(await image(path))).toEqual(expected)
    }, 60_000)

    it('checks the signature before it touches the database', async () => {
      const original = payload.db.drizzle.execute.bind(payload.db.drizzle)
      let queries = 0
      payload.db.drizzle.execute = ((...args: Parameters<typeof original>) => { queries++; return original(...args) }) as typeof original
      try {
        const bad = await image(`/api/social/image/5/square?rev=1&exp=${Math.floor(Date.now() / 1000) + 600}&sig=${'b'.repeat(64)}`)
        expect(bad.status).toBe(404)
        expect(queries).toBe(0)
        const expired = await image(link(5, { hours: -1 }))
        expect(expired.status).toBe(404)
        expect(queries).toBe(0)
      } finally {
        payload.db.drizzle.execute = original
      }
    })
  })

  it('makes no outbound call through the whole flow', async () => {
    const spy = vi.fn(async () => { throw new Error('outbound') })
    vi.stubGlobal('fetch', spy)
    process.env.SOCIAL_MOCK_NETWORK = 'yes'
    await insertPost(payload, { approvedBy: editorId })
    await cron('Bearer local-test')
    expect(spy).not.toHaveBeenCalled()
  }, 60_000)
})
