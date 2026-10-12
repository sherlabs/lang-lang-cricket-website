/**
 * Wave C WP-2 against real Postgres: the queue's access matrix, the composer's server actions (staff only, status and people come
 * from the session, scheduling refusals), the frozen words, edit and pause clearing the approval, retry, mark as posted and delete.
 * No network: the only adapter is the Test network, and fetch is stubbed to fail the test on any outbound call.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLUB_TIMEZONE } from '@/config/site'
import { mockAdapter, mockControl } from '@/lib/social/adapters/mock'
import { publishDue } from '@/lib/social/publisher'
import { utcToClubParts } from '@/lib/social/schedule-time'
import { clearCollection, destroyTestPayload, getTestPayload, resetGlobal, rest, tokenFor } from './helpers'
import { insertPost, postRow, q, resetQueue, seedPlayersAndGame, targetRows } from './social-queue-helpers'
import { resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)
const auth = vi.hoisted(() => ({ token: '' }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(auth.token ? { Authorization: `JWT ${auth.token}` } : {}), cookies: async () => ({ get: () => undefined }) }))

const CTX = { disableRevalidate: true } as const
const day = (n: number) => utcToClubParts(new Date(Date.now() + n * 86_400_000), CLUB_TIMEZONE).date

describe('social posts: actions and access', () => {
  let payload: Payload
  let admin: string, editor: string, selector: string, disabled: string
  let editorId: number, adminId: number
  let sponsor: number

  const actions = () => import('@/lib/social-actions')
  const form = (over: Record<string, unknown> = {}) => ({
    type: 'sponsor-thanks', source: String(sponsor), text: '', style: 'classic', caption: 'Thank you to our sponsors.', hashtags: ['club', 'cricket'],
    targets: [{ network: 'mock', size: 'square' }], date: day(2), time: '12:00', allowOutside: false, ...over,
  })
  const as = (token: string) => { auth.token = token }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    ;[admin, editor, selector] = [await tokenFor(payload, 'admin'), await tokenFor(payload, 'editor'), await tokenFor(payload, 'selector')]
    disabled = await tokenFor(payload, 'editor', 'gone@example.com')
    const gone = await payload.find({ collection: 'users', where: { email: { equals: 'gone@example.com' } }, limit: 1, depth: 0 })
    await payload.update({ collection: 'users', id: gone.docs[0].id, data: { disabled: true } as never, overrideAccess: true, context: { ...CTX, seedAdmin: true } })
    const find = async (email: string) => (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0 })).docs[0].id
    ;[editorId, adminId] = [await find('editor@example.com'), await find('admin@example.com')]
  }, 120_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    delete process.env.SOCIAL_MOCK_NETWORK
    await resetQueue(payload)
    await clearCollection(payload, 'sponsors')
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await resetGlobal(payload, 'social-settings')
    await resetGlobal(payload, 'club')
    await destroyTestPayload(payload)
  })

  beforeEach(async () => {
    mockControl.reset()
    process.env.SOCIAL_MOCK_NETWORK = 'yes'
    auth.token = ''
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => { throw new Error(`unexpected outbound call to ${String(input)}`) })
    await resetQueue(payload)
    await resetGlobal(payload, 'social-settings')
    await resetGlobal(payload, 'club')
    await clearCollection(payload, 'sponsors')
    sponsor = (await payload.create({ collection: 'sponsors', data: { name: 'Hardware', tier: 'Gold', linkUrl: '' } as never, overrideAccess: true, context: CTX })).id
  })

  const count = async () => Number((await q(payload, sql`SELECT count(*)::int AS n FROM "payload"."social_posts"`))[0].n)

  describe('access', () => {
    it('staff can read the queue over REST; nobody can write it; the lease fields never come back', async () => {
      const { id, targets } = await insertPost(payload, { approvedBy: editorId })
      await q(payload, sql`UPDATE "payload"."social_posts" SET claim_token = 'secret-lease', claimed_at = now() WHERE id = ${id} RETURNING id`)
      for (const slug of ['social-posts', 'social-post-targets']) {
        const rowId = slug === 'social-posts' ? id : targets[0]
        expect((await rest('GET', `/${slug}`)).status).toBe(403)
        expect((await rest('GET', `/${slug}`, { token: selector })).status).toBe(403)
        expect((await rest('GET', `/${slug}`, { token: disabled })).status).toBe(403)
        for (const token of [editor, admin]) {
          const list = await rest('GET', `/${slug}`, { token })
          expect(list.status).toBe(200)
          expect(list.json.docs.length).toBeGreaterThan(0)
          expect(JSON.stringify(list.json)).not.toContain('secret-lease')
          expect((await rest('GET', `/${slug}/${rowId}`, { token })).status).toBe(200)
        }
        for (const token of [editor, admin, selector]) {
          expect((await rest('POST', `/${slug}`, { token, body: { title: 'x' } })).status).toBe(403)
          expect((await rest('PATCH', `/${slug}/${rowId}`, { token, body: { status: 'published' } })).status).toBe(403)
          expect((await rest('DELETE', `/${slug}/${rowId}`, { token })).status).toBe(403)
        }
      }
      const byToken = await rest('GET', `/social-posts?where[claimToken][equals]=secret-lease`, { token: admin })
      expect(JSON.stringify(byToken.json)).not.toContain('secret-lease')
      expect(byToken.json?.docs ?? []).toHaveLength(0)
      const one = (await rest('GET', `/social-posts/${id}`, { token: admin })).json
      expect(one).not.toHaveProperty('claimToken')
      expect(one).not.toHaveProperty('claimedAt')
      expect((await postRow(payload, id)).status).toBe('scheduled')
    })

    it('editors change captions and hashtags in the settings, but not the policy fields or the check-in', async () => {
      const ok = await rest('POST', '/globals/social-settings', { token: editor, body: { hashtags: [{ tag: 'cricket' }], signOff: 'Go club', publishWindow: { earliest: '01:00', latest: '23:00' }, lastCronRunAt: '2020-01-01T00:00:00.000Z', observedCronIntervalMinutes: 99 } })
      expect(ok.status).toBe(200)
      const read = (await rest('GET', '/globals/social-settings', { token: admin })).json
      expect(read.hashtags.map((h: { tag: string }) => h.tag)).toEqual(['cricket'])
      expect(read.signOff).toBe('Go club')
      expect(read.publishWindow?.earliest).toBe('07:00')
      expect(read.lastCronRunAt ?? null).toBeNull()
      expect(read.observedCronIntervalMinutes ?? null).toBeNull()
      const adminSave = await rest('POST', '/globals/social-settings', { token: admin, body: { publishWindow: { earliest: '08:00', latest: '20:00' }, lastCronRunAt: '2020-01-01T00:00:00.000Z' } })
      expect(adminSave.status).toBe(200)
      const after = (await rest('GET', '/globals/social-settings', { token: admin })).json
      expect(after.publishWindow.earliest).toBe('08:00')
      expect(after.lastCronRunAt ?? null).toBeNull() // nobody writes the check-in over REST, admins included
      expect((await rest('GET', '/globals/social-settings')).status).toBe(403)
    })
  })

  describe('who may act', () => {
    it('an anonymous caller, a selector and a disabled committee member are refused and write nothing', async () => {
      const a = await actions()
      for (const token of ['', selector, disabled]) {
        as(token)
        for (const r of [await a.saveDraft(form()), await a.schedulePost(form()), await a.pauseScheduledPost(1), await a.retryFailedPost(1), await a.deleteQueuedPost(1), await a.markNetworkPosted(1), await a.markNetworkNotPosted(1)]) {
          expect(r).toEqual({ ok: false, error: 'Please sign in again.' })
        }
      }
      expect(await count()).toBe(0)
    })

    it('an editor schedules; the creator, approver and status come from the session, not the form', async () => {
      const a = await actions()
      as(editor)
      const r = await a.schedulePost({ ...form(), id: undefined, status: 'published', createdBy: adminId, approvedBy: adminId, claimToken: 'x', revision: 99 })
      expect(r.ok).toBe(true)
      const row = await postRow(payload, (r as { id: number }).id)
      expect(row.status).toBe('scheduled')
      expect(Number(row.created_by_id)).toBe(editorId)
      expect(Number(row.approved_by_id)).toBe(editorId)
      expect(row.approved_at).not.toBeNull()
      expect(row.claim_token).toBeNull()
      expect(Number(row.revision)).toBe(1)
      expect(row.next_run_at).not.toBeNull()
      const [t] = await targetRows(payload, Number(row.id))
      expect(t.network).toBe('mock')
      expect(t.status).toBe('pending')
      expect(String(t.final_text)).toContain('Thank you to our sponsors.')
      expect(String(t.final_text)).toContain('#club #cricket')
    }, 60_000)

    it('saving a draft approves nothing', async () => {
      const a = await actions()
      as(editor)
      const r = await a.saveDraft(form({ date: '', time: '' }))
      expect(r.ok).toBe(true)
      const row = await postRow(payload, (r as { id: number }).id)
      expect(row.status).toBe('draft')
      expect(row.approved_by_id).toBeNull()
      expect(row.next_run_at).toBeNull()
    }, 60_000)
  })

  describe('scheduling refusals', () => {
    it('refuses when no network is available, for a stub network, and for a bad site address', async () => {
      const a = await actions()
      as(editor)
      delete process.env.SOCIAL_MOCK_NETWORK
      expect((await a.schedulePost(form())) as { ok: boolean; error?: string }).toMatchObject({ ok: false })
      process.env.SOCIAL_MOCK_NETWORK = 'yes'
      const stubs = { FACEBOOK_PAGE_ID: '1', FACEBOOK_PAGE_ACCESS_TOKEN: 'tok-tok-tok-tok', X_API_KEY: 'k-k-k-k', X_API_SECRET: 's-s-s-s', X_ACCESS_TOKEN: 't-t-t-t', X_ACCESS_TOKEN_SECRET: 'u-u-u-u' }
      Object.assign(process.env, stubs)
      try {
        for (const network of ['facebook', 'x']) {
          const r = await a.schedulePost(form({ targets: [{ network, size: 'square' }] }))
          expect(r).toMatchObject({ ok: false })
        }
      } finally {
        for (const k of Object.keys(stubs)) delete process.env[k]
      }
      await payload.updateGlobal({ slug: 'club', data: { siteUrl: 'http://localhost:3000' } as never, overrideAccess: true, context: CTX })
      const bad = (await a.schedulePost(form())) as { ok: boolean; error?: string }
      expect(bad.ok).toBe(false)
      expect(bad.error).toMatch(/public https/)
      expect(await count()).toBe(0)
    }, 60_000)

    it('refuses a past time, a time outside quiet hours without the tick, a long caption, and a size the network does not take', async () => {
      const a = await actions()
      as(editor)
      expect(((await a.schedulePost(form({ date: day(-1) }))) as { error?: string }).error).toMatch(/future/)
      const late = (await a.schedulePost(form({ time: '23:30' }))) as { ok: boolean; error?: string }
      expect(late.ok).toBe(false)
      expect(late.error).toMatch(/posting hours/)
      expect((await a.schedulePost(form({ time: '23:30', allowOutside: true }))).ok).toBe(true)
      expect((await a.schedulePost(form({ caption: 'x'.repeat(2500) }))).ok).toBe(false)
      expect((await a.schedulePost(form({ targets: [] }))).ok).toBe(false)
      expect((await a.schedulePost(form({ type: 'potm', source: 'nope|1' }))).ok).toBe(false)
      expect(await count()).toBe(1)
    }, 60_000)

    it('refuses a junior without the opt-in, and a player who was not in the game', async () => {
      await resetSelection(payload)
      const { riley, jamie, casey, gameId } = await seedPlayersAndGame(payload)
      const a = await actions()
      as(editor)
      expect((await a.schedulePost(form({ type: 'potm', source: `${gameId}|${jamie}` }))).ok).toBe(false)
      expect((await a.schedulePost(form({ type: 'potm', source: `${gameId}|9999999` }))).ok).toBe(false)
      expect(await count()).toBe(0)
      const good = await a.schedulePost(form({ type: 'potm', source: `${gameId}|${riley}` }))
      const optIn = await a.schedulePost(form({ type: 'potm', source: `${gameId}|${casey}` }))
      expect(good.ok && optIn.ok).toBe(true)
      const spec = (await postRow(payload, (good as { id: number }).id)).spec as { snapshot: { players: { id: number; name: string }[] }; playerIds: number[] }
      expect(spec.snapshot.players).toMatchObject([{ id: riley, name: 'Riley Starr' }])
      expect(spec.playerIds).toEqual([riley])
    }, 90_000)
  })

  describe('frozen words, edit and pause', () => {
    it('the words are composed once at Schedule; later settings changes do not touch an approved post, rescheduling recomposes', async () => {
      const a = await actions()
      as(editor)
      await payload.updateGlobal({ slug: 'social-settings', data: { signOff: 'Original sign-off', hashtags: [{ tag: 'first' }] } as never, overrideAccess: true, context: CTX })
      const r = (await a.schedulePost(form({ hashtags: ['first'] }))) as { ok: true; id: number }
      expect(r.ok).toBe(true)
      await payload.updateGlobal({ slug: 'social-settings', data: { signOff: 'Changed later', hashtags: [{ tag: 'second' }], captionTemplates: { sponsorThanks: 'Something else {sponsor}' } } as never, overrideAccess: true, context: CTX })
      await q(payload, sql`UPDATE "payload"."social_posts" SET next_run_at = now() - interval '1 minute' WHERE id = ${r.id} RETURNING id`)
      await publishDue(payload, { adapters: { mock: mockAdapter }, verifyImage: false })
      expect(mockControl.calls).toHaveLength(1)
      expect(mockControl.calls[0].text).toBe('Thank you to our sponsors.\n\nOriginal sign-off\n\n#first')
      expect((await postRow(payload, r.id)).status).toBe('published')
      // A new post made now picks up the new settings.
      const again = (await a.schedulePost(form({ hashtags: ['second'] }))) as { ok: true; id: number }
      expect(String((await targetRows(payload, again.id))[0].final_text)).toBe('Thank you to our sponsors.\n\nChanged later\n\n#second')
    }, 90_000)

    it('editing a scheduled post moves it back to draft, clears the approval, bumps the revision and drops the frozen words; Schedule recomposes', async () => {
      const a = await actions()
      as(editor)
      const r = (await a.schedulePost(form())) as { ok: true; id: number }
      expect((await postRow(payload, r.id)).approved_by_id).not.toBeNull()
      const edited = await a.saveDraft({ ...form({ caption: 'A new caption.' }), id: r.id })
      expect(edited).toMatchObject({ ok: true, id: r.id })
      const row = await postRow(payload, r.id)
      expect(row.status).toBe('draft')
      expect(row.approved_by_id).toBeNull()
      expect(row.approved_at).toBeNull()
      expect(row.next_run_at).toBeNull()
      expect(Number(row.revision)).toBeGreaterThan(1)
      expect((await targetRows(payload, r.id))[0].final_text).toBeNull()
      as(admin)
      const again = await a.schedulePost({ ...form({ caption: 'A new caption.' }), id: r.id })
      expect(again.ok).toBe(true)
      const re = await postRow(payload, r.id)
      expect(re.status).toBe('scheduled')
      expect(Number(re.approved_by_id)).toBe(adminId) // the person who scheduled again is the approver
      expect(String((await targetRows(payload, r.id))[0].final_text)).toContain('A new caption.')
    }, 90_000)

    it('Pause (back to draft) clears the approval; a post being sent or already tried cannot be paused or edited', async () => {
      const a = await actions()
      as(editor)
      const r = (await a.schedulePost(form())) as { ok: true; id: number }
      expect(await a.pauseScheduledPost(r.id)).toEqual({ ok: true })
      const row = await postRow(payload, r.id)
      expect(row.status).toBe('draft')
      expect(row.approved_by_id).toBeNull()
      expect(await a.pauseScheduledPost(r.id)).toMatchObject({ ok: false }) // only while scheduled
      const sending = await insertPost(payload, { status: 'publishing', approvedBy: editorId })
      expect(await a.pauseScheduledPost(sending.id)).toMatchObject({ ok: false })
      const tried = await insertPost(payload, { status: 'scheduled', approvedBy: editorId, targets: [{ status: 'pending' }, { status: 'failed' }] })
      expect(await a.pauseScheduledPost(tried.id)).toMatchObject({ ok: false })
      expect((await a.saveDraft({ ...form(), id: tried.id })).ok).toBe(false)
      expect((await a.saveDraft({ ...form(), id: sending.id })).ok).toBe(false)
      const done = await insertPost(payload, { status: 'published', approvedBy: editorId })
      expect((await a.saveDraft({ ...form(), id: done.id })).ok).toBe(false)
    }, 90_000)
  })

  describe('retry, mark as posted, delete', () => {
    it('retry puts failed networks back; it refuses while one is unknown; the posted one is never re-sent', async () => {
      const a = await actions()
      as(editor)
      const post = await insertPost(payload, { status: 'failed', approvedBy: editorId, targets: [{ network: 'mock', status: 'published', attempts: 1 }, { network: 'facebook', status: 'unknown', attempts: 1 }, { network: 'x', status: 'failed', attempts: 3 }] })
      expect(await a.retryFailedPost(post.id)).toMatchObject({ ok: false, error: expect.stringMatching(/Check the page/) })
      expect(await a.markNetworkNotPosted(post.targets[1])).toEqual({ ok: true })
      expect(await a.retryFailedPost(post.id)).toEqual({ ok: true })
      const t = await targetRows(payload, post.id)
      expect(t.map((x) => x.status)).toEqual(['published', 'pending', 'pending'])
      expect(t.map((x) => x.attempts)).toEqual(['1', '0', '0'])
      expect((await postRow(payload, post.id)).status).toBe('scheduled')
      expect(await a.retryFailedPost(post.id)).toMatchObject({ ok: false }) // no longer failed
    })

    it('retry by a new person re-approves when the original approver has left the committee', async () => {
      const a = await actions()
      const post = await insertPost(payload, { status: 'failed', approvedBy: editorId, targets: [{ status: 'failed', attempts: 3 }] })
      await q(payload, sql`UPDATE "payload"."users" SET role = 'selector' WHERE id = ${editorId}`)
      try {
        as(admin)
        expect(await a.retryFailedPost(post.id)).toEqual({ ok: true })
        expect(Number((await postRow(payload, post.id)).approved_by_id)).toBe(adminId)
      } finally {
        await q(payload, sql`UPDATE "payload"."users" SET role = 'editor' WHERE id = ${editorId}`)
      }
    })

    it('Mark as posted records a manual post, and the post becomes published once every network is done', async () => {
      const a = await actions()
      as(editor)
      const post = await insertPost(payload, { status: 'failed', approvedBy: editorId, targets: [{ network: 'mock', status: 'published' }, { network: 'x', status: 'failed', attempts: 3 }] })
      expect(await a.markNetworkPosted(post.targets[0])).toMatchObject({ ok: false }) // already posted by the site
      expect(await a.markNetworkPosted(post.targets[1])).toEqual({ ok: true })
      const t = (await targetRows(payload, post.id))[1]
      expect(t).toMatchObject({ status: 'published', manual: true, remote_id: 'manual' })
      const row = await postRow(payload, post.id)
      expect(row.status).toBe('published')
      expect(row.finished_at).not.toBeNull()
      const sending = await insertPost(payload, { status: 'publishing', approvedBy: editorId, targets: [{ status: 'failed' }] })
      expect(await a.markNetworkPosted(sending.targets[0])).toMatchObject({ ok: false })
    })

    it('delete works for drafts, posted and failed rows, not for scheduled or sending ones', async () => {
      const a = await actions()
      as(editor)
      const rows = {
        draft: await insertPost(payload, { status: 'draft' }), published: await insertPost(payload, { status: 'published', approvedBy: editorId }), failed: await insertPost(payload, { status: 'failed', approvedBy: editorId }),
        scheduled: await insertPost(payload, { status: 'scheduled', approvedBy: editorId }), publishing: await insertPost(payload, { status: 'publishing', approvedBy: editorId }),
      }
      for (const k of ['draft', 'published', 'failed'] as const) {
        expect(await a.deleteQueuedPost(rows[k].id)).toEqual({ ok: true })
        expect(await targetRows(payload, rows[k].id)).toHaveLength(0)
      }
      for (const k of ['scheduled', 'publishing'] as const) {
        expect(await a.deleteQueuedPost(rows[k].id)).toMatchObject({ ok: false })
        expect(await targetRows(payload, rows[k].id)).toHaveLength(1)
      }
    })
  })
})
