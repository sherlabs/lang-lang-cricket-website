/**
 * Wave C WP-2 publisher against real Postgres (spec 4.6, 4.10): the atomic claim under concurrency, the claim token on the final write,
 * per-target SQL that never disturbs siblings, lease recovery, backoff, the unknown outcome, per-network independence, re-validation,
 * approval and "Post now". Adapters are the Test network or fakes; fetch is stubbed to fail the test on ANY outbound call.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockAdapter, mockControl } from '@/lib/social/adapters/mock'
import type { NetworkAdapter, PublishResult } from '@/lib/social/adapters/types'
import { claimDue, finishPost, publishDue } from '@/lib/social/publisher'
import { clearCollection, destroyTestPayload, getTestPayload, tokenFor } from './helpers'
import { insertPost, makeDue, plainSpec, postRow, q, resetQueue, seedPlayersAndGame, targetRows } from './social-queue-helpers'
import { resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)

const CTX = { disableRevalidate: true } as const
const adapters = { mock: mockAdapter }
const fake = (id: NetworkAdapter['id'], answer: (n: number) => PublishResult | Promise<PublishResult>): NetworkAdapter & { calls: number[] } => {
  const f = { calls: [] as number[], id, label: id, live: true, sizes: ['square', 'landscape', 'story'] as NetworkAdapter['sizes'], limits: { maxChars: 1000, maxHashtags: 5 }, isConfigured: () => true, publish: async (i: { postId: number }) => { f.calls.push(i.postId); return answer(f.calls.length) } }
  return f
}

describe('social publisher', () => {
  let payload: Payload
  let editor: number, other: number, admin: number

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    await tokenFor(payload, 'admin'); await tokenFor(payload, 'editor'); await tokenFor(payload, 'editor', 'other@example.com')
    const find = async (email: string) => (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0 })).docs[0].id
    ;[admin, editor, other] = [await find('admin@example.com'), await find('editor@example.com'), await find('other@example.com')]
  }, 120_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    await resetQueue(payload)
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await clearCollection(payload, 'sponsors')
    await clearCollection(payload, 'events')
    await destroyTestPayload(payload)
  })

  beforeEach(async () => {
    mockControl.reset()
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => { throw new Error(`unexpected outbound call to ${String(input)}`) })
    await resetQueue(payload)
    await q(payload, sql`UPDATE "payload"."users" SET role = 'editor', disabled = false WHERE id IN (${editor}, ${other})`)
  })
  afterEach(() => vi.restoreAllMocks())

  const run = (o: Parameters<typeof publishDue>[1] = {}) => publishDue(payload, { adapters, verifyImage: false, ...o })

  it('claims each due post exactly once under concurrent runs', async () => {
    const ids: number[] = []
    for (let i = 0; i < 5; i++) ids.push((await insertPost(payload, { approvedBy: editor })).id)
    await Promise.all([run(), run(), run(), run()])
    const perPost = new Map<number, number>()
    for (const c of mockControl.calls) perPost.set(c.postId, (perPost.get(c.postId) ?? 0) + 1)
    expect([...perPost.keys()].sort()).toEqual([...ids].sort())
    expect([...perPost.values()]).toEqual([1, 1, 1, 1, 1])
    const left = await q(payload, sql`SELECT count(*)::int AS n FROM "payload"."social_posts" WHERE status = 'publishing' OR claim_token IS NOT NULL`)
    expect(left[0].n).toBe(0)
    for (const id of ids) expect((await postRow(payload, id)).status).toBe('published')
  })

  it('does not claim a post that is not due, a draft, or a post scheduled for later', async () => {
    const future = await insertPost(payload, { approvedBy: editor, nextRunAt: new Date(Date.now() + 3_600_000).toISOString() })
    const draft = await insertPost(payload, { status: 'draft' })
    expect((await run()).claimed).toEqual([])
    expect(mockControl.calls).toHaveLength(0)
    expect((await postRow(payload, future.id)).status).toBe('scheduled')
    expect((await postRow(payload, draft.id)).status).toBe('draft')
  })

  it('only the worker holding the claim token can write the final state', async () => {
    const { id } = await insertPost(payload, { approvedBy: editor })
    const first = 'token-one'
    expect(await claimDue(payload, first)).toEqual([id])
    // The first worker stalls; its lease runs out and a second worker takes the post.
    await q(payload, sql`UPDATE "payload"."social_posts" SET claimed_at = now() - interval '30 minutes' WHERE id = ${id} RETURNING id`)
    const second = 'token-two'
    expect(await claimDue(payload, second)).toEqual([id])
    // The stale worker finishes: zero rows change and the second worker's claim is intact.
    expect(await finishPost(payload, id, first, { status: 'published', nextRunAt: null })).toBe(false)
    let row = await postRow(payload, id)
    expect(row.status).toBe('publishing')
    expect(row.claim_token).toBe(second)
    // The real holder finishes: exactly one row, and the claim fields are cleared in the same statement.
    expect(await finishPost(payload, id, second, { status: 'published', nextRunAt: null })).toBe(true)
    row = await postRow(payload, id)
    expect(row.status).toBe('published')
    expect(row.claim_token).toBeNull()
    expect(row.claimed_at).toBeNull()
    expect(row.finished_at).not.toBeNull()
  })

  it('moves one target without touching its siblings, and each network is independent', async () => {
    const { id, targets } = await insertPost(payload, { approvedBy: editor, targets: [{ network: 'facebook' }, { network: 'x' }, { network: 'instagram' }] })
    const fb = fake('facebook', () => ({ ok: true, remoteId: 'fb-1' }))
    const x = fake('x', () => ({ ok: false, outcome: 'rejected', retryable: true, reason: 'busy', code: 'rate_limited' }))
    const ig = fake('instagram', () => ({ ok: true, remoteId: 'ig-1' }))
    const before = await targetRows(payload, id)
    await publishDue(payload, { adapters: { facebook: fb, x, instagram: ig }, verifyImage: false })
    const after = await targetRows(payload, id)
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id)) // same rows, no delete and re-insert
    expect(after.map((r) => r.status)).toEqual(['published', 'pending', 'published'])
    expect(after[0].remote_id).toBe('fb-1')
    expect(after[2].remote_id).toBe('ig-1')
    expect(after[1].attempts).toBe('1')
    expect(after[1].next_attempt_at).not.toBeNull()
    expect((await postRow(payload, id)).status).toBe('scheduled')
    expect(targets).toHaveLength(3)
    // The retry goes to X only: the networks that already posted are not called again.
    await makeDue(payload, id)
    await publishDue(payload, { adapters: { facebook: fb, x: fake('x', () => ({ ok: true, remoteId: 'x-1' })), instagram: ig }, verifyImage: false })
    expect(fb.calls).toHaveLength(1)
    expect(ig.calls).toHaveLength(1)
    expect((await postRow(payload, id)).status).toBe('published')
  })

  it('recovers a lease: a target stuck publishing becomes unknown and is never sent again', async () => {
    const stuck = await insertPost(payload, { status: 'publishing', approvedBy: editor, targets: [{ status: 'publishing', attempts: 1 }] })
    const fresh = await insertPost(payload, { status: 'publishing', approvedBy: editor, targets: [{ status: 'pending' }] })
    for (const id of [stuck.id, fresh.id]) await q(payload, sql`UPDATE "payload"."social_posts" SET claim_token = 'dead', claimed_at = now() - interval '30 minutes' WHERE id = ${id} RETURNING id`)
    await run()
    const t = (await targetRows(payload, stuck.id))[0]
    expect(t.status).toBe('unknown')
    expect(t.error_code).toBe('run_stopped')
    expect((await postRow(payload, stuck.id)).status).toBe('failed')
    // The one with nothing sent yet is re-claimed and published.
    expect((await postRow(payload, fresh.id)).status).toBe('published')
    expect(mockControl.calls.map((c) => c.postId)).toEqual([fresh.id])
  })

  it('does not reclaim a post whose lease is still running', async () => {
    const live = await insertPost(payload, { status: 'publishing', approvedBy: editor })
    await q(payload, sql`UPDATE "payload"."social_posts" SET claim_token = 'busy', claimed_at = now() WHERE id = ${live.id} RETURNING id`)
    await run()
    expect(mockControl.calls).toHaveLength(0)
    expect((await postRow(payload, live.id)).claim_token).toBe('busy')
  })

  it('backs off 5 then 15 minutes, then succeeds', async () => {
    const { id } = await insertPost(payload, { approvedBy: editor })
    mockControl.queue.push('retryable', 'retryable', 'success')
    const t0 = new Date('2026-10-12T10:00:00Z')
    await run({ now: t0 })
    let t = (await targetRows(payload, id))[0]
    expect(t.status).toBe('pending')
    expect(new Date(String(t.next_attempt_at)).toISOString()).toBe('2026-10-12T10:05:00.000Z')
    expect((await postRow(payload, id)).status).toBe('scheduled')
    // Not yet due again: a run now sends nothing.
    await q(payload, sql`UPDATE "payload"."social_posts" SET next_run_at = now() + interval '1 hour' WHERE id = ${id} RETURNING id`)
    await run({ now: t0 })
    expect(mockControl.calls).toHaveLength(1)
    await makeDue(payload, id)
    await run({ now: new Date('2026-10-12T10:05:00Z') })
    t = (await targetRows(payload, id))[0]
    expect(new Date(String(t.next_attempt_at)).toISOString()).toBe('2026-10-12T10:20:00.000Z')
    await makeDue(payload, id)
    await run({ now: new Date('2026-10-12T10:20:00Z') })
    expect((await postRow(payload, id)).status).toBe('published')
    expect(mockControl.calls).toHaveLength(3)
  })

  it('fails after the third attempt with a scrubbed reason, and Retry resets failed targets only', async () => {
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'fb-token-secret-value'
    try {
      const { id } = await insertPost(payload, { approvedBy: editor, targets: [{ network: 'mock' }, { network: 'facebook' }] })
      const leaky = fake('facebook', () => ({ ok: false, outcome: 'rejected', retryable: true, reason: `bad token fb-token-secret-value in ${'x'.repeat(400)}` }))
      mockControl.fallback = 'success'
      for (let i = 0; i < 3; i++) {
        await publishDue(payload, { adapters: { mock: mockAdapter, facebook: leaky }, verifyImage: false })
        await makeDue(payload, id)
      }
      const [mock, fb] = await targetRows(payload, id)
      expect(mock.status).toBe('published')
      // The third failed attempt is the last: the target is failed, the post is failed, and the reason holds no secret.
      expect(fb.status).toBe('failed')
      expect(fb.attempts).toBe('3')
      expect((await postRow(payload, id)).status).toBe('failed')
      expect(String(fb.last_error)).not.toContain('fb-token-secret-value')
      expect(String(fb.last_error).length).toBeLessThanOrEqual(300)
      expect(leaky.calls).toHaveLength(3)
      // Retry now: failed targets are reset, the posted one is untouched and never re-sent.
      const { retryPost } = await import('@/lib/social/queue-core')
      expect(await retryPost(payload, { id: other, role: 'editor' } as never, id)).toEqual({ ok: true })
      const [mock2, fb2] = await targetRows(payload, id)
      expect({ status: mock2.status, attempts: mock2.attempts, remote: mock2.remote_id }).toEqual({ status: 'published', attempts: mock.attempts, remote: mock.remote_id })
      expect({ status: fb2.status, attempts: fb2.attempts, error: fb2.last_error }).toEqual({ status: 'pending', attempts: '0', error: null })
      expect((await postRow(payload, id)).status).toBe('scheduled')
      const ok = fake('facebook', () => ({ ok: true, remoteId: 'fb-2' }))
      await publishDue(payload, { adapters: { mock: mockAdapter, facebook: ok }, verifyImage: false })
      expect(ok.calls).toHaveLength(1)
      expect(mockControl.calls).toHaveLength(1)
      expect((await postRow(payload, id)).status).toBe('published')
    } finally {
      delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN
    }
  })

  it('a timeout, a crash or an unknown answer makes the target unknown and it is never retried', async () => {
    for (const how of ['unknown', 'throw', 'slow'] as const) {
      await resetQueue(payload)
      mockControl.reset()
      mockControl.slowMs = 5_000
      const { id } = await insertPost(payload, { approvedBy: editor })
      mockControl.queue.push(how)
      await run({ timeoutMs: 40 })
      const t = (await targetRows(payload, id))[0]
      expect({ how, status: t.status }).toEqual({ how, status: 'unknown' })
      expect((await postRow(payload, id)).status).toBe('failed')
      expect(mockControl.calls).toHaveLength(1)
      // Later runs, and even a forced "due", never send it again.
      await q(payload, sql`UPDATE "payload"."social_posts" SET status = 'scheduled', next_run_at = now() - interval '1 minute' WHERE id = ${id} RETURNING id`)
      await run()
      expect(mockControl.calls).toHaveLength(1)
    }
  })

  it('fails the target when a networks refuses for good (not retried)', async () => {
    const { id } = await insertPost(payload, { approvedBy: editor })
    mockControl.queue.push('rejected')
    await run()
    const t = (await targetRows(payload, id))[0]
    expect(t.status).toBe('failed')
    expect(t.error_code).toBe('media_rejected')
    expect((await postRow(payload, id)).status).toBe('failed')
  })

  describe('re-validation before sending', () => {
    let riley: number, jamie: number, casey: number
    beforeEach(async () => {
      await resetSelection(payload)
      ;({ riley, jamie, casey } = await seedPlayersAndGame(payload))
    })
    const withPlayer = (id: number, name: string, extra: Partial<Parameters<typeof plainSpec>[0]> = {}) =>
      insertPost(payload, { approvedBy: editor, spec: plainSpec({ playerIds: [id], snapshot: { data: {}, players: [{ id, name, version: 'v' }] }, ...extra }) })

    it('sends when every player is still visible, unchanged and allowed', async () => {
      const { id } = await withPlayer(riley, 'Riley Starr')
      await run()
      expect((await postRow(payload, id)).status).toBe('published')
      const c = await withPlayer(casey, 'Casey Consent') // a junior with the opt-in is fine
      await run()
      expect((await postRow(payload, c.id)).status).toBe('published')
    })

    it.each([
      ['hidden', async (p: Payload, id: number) => void (await p.update({ collection: 'players', id, data: { hidden: true } as never, overrideAccess: true, context: CTX }))],
      ['renamed', async (p: Payload, id: number) => void (await p.update({ collection: 'players', id, data: { firstName: 'Renamed' } as never, overrideAccess: true, context: CTX }))],
      ['deleted (merged away)', async (p: Payload, id: number) => void (await p.delete({ collection: 'players', id, overrideAccess: true, context: CTX }))],
    ])('fails with content_changed when a player is %s, without calling the network', async (_name, change) => {
      const { id } = await withPlayer(riley, 'Riley Starr')
      await change(payload, riley)
      await run()
      const t = (await targetRows(payload, id))[0]
      expect(t.status).toBe('failed')
      expect(t.error_code).toBe('content_changed')
      expect(mockControl.calls).toHaveLength(0)
    })

    it('fails when a junior loses the social opt-in, and when a player becomes a junior', async () => {
      const a = await withPlayer(casey, 'Casey Consent')
      await payload.update({ collection: 'players', id: casey, data: { socialOptIn: false } as never, overrideAccess: true, context: CTX })
      const b = await withPlayer(riley, 'Riley Starr')
      await payload.update({ collection: 'players', id: riley, data: { isJunior: true } as never, overrideAccess: true, context: CTX })
      await run()
      for (const p of [a, b]) expect((await targetRows(payload, p.id))[0].error_code).toBe('content_changed')
      expect(mockControl.calls).toHaveLength(0)
      expect(jamie).toBeGreaterThan(0)
    })

    it('fails when an event is deleted or a sponsor removed after scheduling', async () => {
      const ev = await payload.create({ collection: 'events', data: { type: 'one_time', title: 'Night', description: '', location: 'Rooms', eventTime: '18:00', eventDate: new Date(Date.now() + 86_400_000).toISOString() } as never, overrideAccess: true, context: CTX })
      const sp = await payload.create({ collection: 'sponsors', data: { name: 'Hardware', tier: 'Gold', linkUrl: '' } as never, overrideAccess: true, context: CTX })
      const a = await insertPost(payload, { approvedBy: editor, spec: plainSpec({ eventId: ev.id }) })
      const b = await insertPost(payload, { approvedBy: editor, spec: plainSpec({ sponsorIds: [sp.id] }) })
      await run()
      expect((await postRow(payload, a.id)).status).toBe('published')
      expect((await postRow(payload, b.id)).status).toBe('published')
      const c = await insertPost(payload, { approvedBy: editor, spec: plainSpec({ eventId: ev.id }) })
      const d = await insertPost(payload, { approvedBy: editor, spec: plainSpec({ sponsorIds: [sp.id] }) })
      await payload.delete({ collection: 'events', id: ev.id, overrideAccess: true, context: CTX })
      await payload.delete({ collection: 'sponsors', id: sp.id, overrideAccess: true, context: CTX })
      const calls = mockControl.calls.length
      await run()
      for (const p of [c, d]) expect((await targetRows(payload, p.id))[0].error_code).toBe('content_changed')
      expect(mockControl.calls).toHaveLength(calls)
    })
  })

  describe('approval', () => {
    it('fails with approver_inactive when the approver was demoted, disabled, deleted or never set', async () => {
      const demoted = await insertPost(payload, { approvedBy: other })
      await q(payload, sql`UPDATE "payload"."users" SET role = 'selector' WHERE id = ${other}`)
      const disabled = await insertPost(payload, { approvedBy: editor })
      await q(payload, sql`UPDATE "payload"."users" SET disabled = true WHERE id = ${editor}`)
      const none = await insertPost(payload, { approvedBy: null })
      await run()
      for (const p of [demoted, disabled, none]) {
        const t = (await targetRows(payload, p.id))[0]
        expect(t.status).toBe('failed')
        expect(t.error_code).toBe('approver_inactive')
        expect((await postRow(payload, p.id)).status).toBe('failed')
      }
      expect(mockControl.calls).toHaveLength(0)
    })

    it('an admin or editor approver still publishes', async () => {
      const a = await insertPost(payload, { approvedBy: admin })
      const b = await insertPost(payload, { approvedBy: editor })
      await run()
      expect((await postRow(payload, a.id)).status).toBe('published')
      expect((await postRow(payload, b.id)).status).toBe('published')
    })
  })

  it('renders the picture once before sending, and fails the target when the snapshot cannot be drawn', async () => {
    const ok = await insertPost(payload, { approvedBy: editor })
    const bad = await insertPost(payload, { approvedBy: editor, spec: plainSpec({ snapshot: { data: null, players: [] } }) })
    await publishDue(payload, { adapters })
    expect((await postRow(payload, ok.id)).status).toBe('published')
    expect((await targetRows(payload, bad.id))[0].error_code).toBe('render_failed')
    expect(mockControl.calls.map((c) => c.postId)).toEqual([ok.id])
  }, 60_000)

  it('sends the stored words verbatim and a signed picture link that matches the revision', async () => {
    const { id } = await insertPost(payload, { approvedBy: editor, targets: [{ finalText: 'Exactly these words #one' }] })
    await q(payload, sql`UPDATE "payload"."social_posts" SET revision = 4 WHERE id = ${id} RETURNING id`)
    await run()
    expect(mockControl.calls[0].text).toBe('Exactly these words #one')
    expect(mockControl.calls[0].imageUrl).toContain(`/api/social/image/${id}/square?rev=4&exp=`)
  })

  describe('post now', () => {
    it('posts a scheduled post that is not yet due, and refuses drafts, posted rows and rows being sent', async () => {
      const later = await insertPost(payload, { approvedBy: editor, nextRunAt: new Date(Date.now() + 86_400_000).toISOString() })
      const draft = await insertPost(payload, { status: 'draft' })
      const done = await insertPost(payload, { status: 'published', approvedBy: editor })
      const busy = await insertPost(payload, { status: 'publishing', approvedBy: editor })
      for (const p of [draft, done, busy]) expect((await run({ onlyId: p.id })).claimed).toEqual([])
      expect(mockControl.calls).toHaveLength(0)
      const r = await run({ onlyId: later.id })
      expect(r.claimed).toEqual([{ id: later.id, status: 'published' }])
      expect(mockControl.calls).toHaveLength(1)
    })

    it('the route is staff-only, same-origin JSON, and rate limited', async () => {
      const { POST } = await import('@/app/api/admin/social/post-now/route')
      const editorToken = await tokenFor(payload, 'editor')
      const selectorToken = await tokenFor(payload, 'selector')
      const call = (token: string | null, body: unknown, extra: Record<string, string> = {}) =>
        POST(new Request('http://localhost:3000/api/admin/social/post-now', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}), ...extra }, body: JSON.stringify(body) }))
      const { id } = await insertPost(payload, { approvedBy: editor })
      expect((await call(null, { id })).status).toBe(404)
      expect((await call(selectorToken, { id })).status).toBe(404)
      expect((await call(editorToken, { id }, { origin: 'https://evil.example' })).status).toBe(404)
      expect((await call(editorToken, { id: 'x' })).status).toBe(400)
      expect((await postRow(payload, id)).status).toBe('scheduled')
      process.env.SOCIAL_MOCK_NETWORK = 'yes'
      try {
        const ok = await call(editorToken, { id })
        expect(ok.status).toBe(200)
        expect((await ok.json()).status).toBe('published')
        expect((await call(editorToken, { id })).status).toBe(409)
        for (let i = 0; i < 8; i++) await call(editorToken, { id })
        expect((await call(editorToken, { id })).status).toBe(429)
      } finally {
        delete process.env.SOCIAL_MOCK_NETWORK
      }
    }, 60_000)
  })
})
