import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

// Mail is switched on for this file only (isolate.ts clears these before the next file). The mock provider makes no network call.
vi.hoisted(() => {
  process.env.EMAIL_PROVIDER = 'mock'
  process.env.EMAIL_FROM_ADDRESS = 'club@example.org'
  process.env.EMAIL_RATE_PER_SECOND = '100'
  process.env.CRON_SECRET = 'local-test'
  process.env.TRUSTED_IP_HEADER = 'x-test-ip'
})
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
const nav = vi.hoisted(() => ({ ip: '203.0.113.9' }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-test-ip': nav.ip }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to })
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import { mockMail } from '@/lib/email/adapters/mock'
import { unsubToken, emailHash } from '@/lib/email/unsub-token'
import { volunteerTokenMatches } from '@/lib/volunteer-link'
import { isLocked } from '@/lib/throttle'

/**
 * Bulk email (wave D WP-6) against real Postgres and the mock provider: the dark module when mail is off, access, a whole
 * campaign through batches, an unsubscribe landing mid-send, retries, two workers at once, the test copy, the public opt-out
 * (GET never writes, a valid link is never limited, a bad one is counted), purging, erasure, and the cron run. Nothing leaves the machine.
 */
const ORIGIN = 'http://localhost:3000'
const noSleep = async () => undefined

describe('bulk email', () => {
  let payload: Payload
  const tok: Record<string, string> = {}
  const user: Record<string, unknown> = {}
  let q: typeof import('@/lib/email-office-queries')
  let core: typeof import('@/lib/email/campaign')
  let unsub: typeof import('@/lib/email/unsubscribe')
  const ids: Record<string, number> = {}

  const rows = async (query: ReturnType<typeof sql>) => ((await payload.db.drizzle.execute(query)) as unknown as { rows: Record<string, unknown>[] }).rows
  const member = async (key: string, data: Record<string, unknown>) => {
    const doc = await payload.create({ collection: 'members', data: { roles: ['supporter'], ...data } as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } })
    ids[key] = doc.id as number
    return doc.id as number
  }
  const recipients = async (campaignId: number) =>
    ((await rows(sql`SELECT id, email, status, attempts, first_name, email_hash FROM "payload"."email_recipients" WHERE campaign_id = ${campaignId} ORDER BY id`)) as { id: number; email: string | null; status: string; attempts: number | string; first_name: string | null; email_hash: string }[]).map((r) => ({ ...r, id: Number(r.id), attempts: Number(r.attempts) }))
  const campaign = async (data: Record<string, unknown> = {}) => {
    const r = await q.createCampaign(user.admin, { subject: 'Hello {firstName|there}', body: 'Hi {firstName|there},\n\nSee {clubName}. Your page: {volunteerLink}', ...data })
    if (!r.ok) throw new Error(`campaign: ${r.code}`)
    return r.id
  }
  const preview = async (id: number) => (await q.getCampaignPage(user.admin, id))!
  const sendAll = async (id: number, expected?: number) => {
    const page = await preview(id)
    const r = await q.startSend(user.admin, id, expected ?? page.audienceCounts!.willReceive)
    if (!r.ok) throw new Error(`send: ${r.code}`)
    for (let i = 0; i < 20; i++) {
      const b = await q.runBatchFor(id, { sleep: noSleep })
      if (!b || b.remaining === 0 || b.processed === 0) break
    }
  }
  const post = async (route: string, opts: { token?: string; origin?: string | null; form?: Record<string, string> } = {}) => {
    const body = new FormData()
    for (const [k, v] of Object.entries(opts.form ?? {})) body.append(k, v)
    const headers: Record<string, string> = {}
    if (opts.token) headers.Authorization = `JWT ${opts.token}`
    if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN
    const request = new Request(`${ORIGIN}${route}`, { method: 'POST', headers, body })
    const seg = route.replace('/api/admin/office/email/', '').split('/')
    if (seg[0] === 'new') return (await import('@/app/api/admin/office/email/new/route')).POST(request)
    if (seg[0] === 'suppression') return (await import('@/app/api/admin/office/email/suppression/[action]/route')).POST(request, { params: Promise.resolve({ action: seg[1] }) })
    return (await import('@/app/api/admin/office/email/[id]/[action]/route')).POST(request, { params: Promise.resolve({ id: seg[0], action: seg[1] }) })
  }
  const unsubPost = async (token: string, ip = '198.51.100.7') => {
    const { POST } = await import('@/app/api/public/unsubscribe/[token]/route')
    return POST(new Request(`${ORIGIN}/api/public/unsubscribe/${token}`, { method: 'POST', headers: { 'x-test-ip': ip, 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), { params: Promise.resolve({ token }) })
  }
  const suppressed = async (email: string) => (await payload.count({ collection: 'email-suppressions', where: { emailHash: { equals: emailHash(email) } }, overrideAccess: true })).totalDocs
  const wipe = async () => {
    for (const c of ['email-recipients', 'email-suppressions', 'email-campaigns', 'office-audit-log', 'throttle-hits'] as const) await clearCollection(payload, c)
  }
  const seedMembers = async () => {
    await clearCollection(payload, 'members')
    await member('alice', { firstName: 'Alice', lastName: 'Adams', email: 'alice@example.org', roles: ['player', 'volunteer'] })
    await member('bob', { firstName: 'Bob', lastName: 'Brown', email: 'bob@example.org' })
    await member('cara', { firstName: 'Cara', lastName: 'Clark', email: 'cara@example.org', doNotEmail: true })
    await member('dan', { firstName: 'Dan', lastName: 'Dunn' })
    await member('fay', { firstName: 'Fay', lastName: 'Evans', email: 'fay@example.org', roles: ['parent'] })
    await member('eli', { firstName: 'Eli', lastName: 'Evans', dateOfBirth: '2016-05-05T12:00:00.000Z', roles: ['player'], guardians: [ids.fay] })
    await member('gone', { firstName: 'Gus', lastName: 'Gray', email: 'gus@example.org', status: 'past' })
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    for (const role of ['admin', 'editor', 'selector'] as const) {
      tok[role] = await tokenFor(payload, role)
      const found = await payload.find({ collection: 'users', where: { email: { equals: `${role}@example.com` } }, limit: 1, depth: 0, overrideAccess: true })
      user[role] = { ...(found.docs[0] as object), collection: 'users' }
    }
    q = await import('@/lib/email-office-queries')
    core = await import('@/lib/email/campaign')
    unsub = await import('@/lib/email/unsubscribe')
  }, 120_000)
  afterAll(async () => {
    await wipe().catch(() => undefined)
    await clearCollection(payload, 'members').catch(() => undefined)
    await clearCollection(payload, 'users')
    for (const k of ['EMAIL_PROVIDER', 'EMAIL_FROM_ADDRESS', 'EMAIL_RATE_PER_SECOND', 'CRON_SECRET', 'TRUSTED_IP_HEADER', 'EMAIL_BATCH_SIZE']) delete process.env[k]
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    vi.unstubAllEnvs()
    mockMail.reset()
    nav.ip = '203.0.113.9'
    await wipe()
    await seedMembers()
  })

  describe('when mail is off', () => {
    it('the module is dark: no tile, queries null, every route 404, the schedule idle, and the provider is never called', async () => {
      const id = await campaign()
      vi.stubEnv('EMAIL_PROVIDER', '')
      const { modulesFor } = await import('@/lib/office/modules')
      expect(modulesFor('admin').map((m) => m.key)).not.toContain('email')
      expect(await q.getEmailOverview(user.admin)).toBeNull()
      expect(await q.getCampaignPage(user.admin, id)).toBeNull()
      expect((await q.createCampaign(user.admin, { subject: 's', body: 'b' })).ok).toBe(false)
      expect((await q.startSend(user.admin, id, 1)).ok).toBe(false)
      for (const route of [`/api/admin/office/email/new`, `/api/admin/office/email/${id}/send`, `/api/admin/office/email/${id}/batch`, `/api/admin/office/email/suppression/add`]) {
        expect((await post(route, { token: tok.admin })).status, route).toBe(404)
      }
      const { GET } = await import('@/app/api/cron/email-batch/route')
      expect((await GET(new Request(`${ORIGIN}/api/cron/email-batch`, { headers: { authorization: 'Bearer local-test' } }))).status).toBe(404)
      const { OfficeEmailView } = await import('@/payload/components/OfficeEmailView')
      await expect(OfficeEmailView({ initPageResult: { req: { payload, user: user.admin } } } as never)).rejects.toThrow('NEXT_NOT_FOUND')
      expect(mockMail.calls()).toBe(0)
    })
    it('with mail on, the tile is there for admins and not for editors', async () => {
      const { modulesFor } = await import('@/lib/office/modules')
      expect(modulesFor('admin').map((m) => m.key)).toContain('email')
      expect(modulesFor('editor').map((m) => m.key)).not.toContain('email')
    })
  })

  describe('access', () => {
    it('anonymous 401, selector and editor 403, a foreign or missing origin 403, on every email route', async () => {
      const id = await campaign()
      for (const route of ['/api/admin/office/email/new', `/api/admin/office/email/${id}/save`, `/api/admin/office/email/${id}/send`, `/api/admin/office/email/${id}/test`, `/api/admin/office/email/${id}/stop`, `/api/admin/office/email/${id}/batch`, '/api/admin/office/email/suppression/add', '/api/admin/office/email/suppression/remove']) {
        expect((await post(route)).status, `${route} anonymous`).toBe(401)
        expect((await post(route, { token: tok.selector })).status, `${route} selector`).toBe(403)
        expect((await post(route, { token: tok.editor })).status, `${route} editor`).toBe(403)
        expect((await post(route, { token: tok.admin, origin: 'https://evil.example' })).status, `${route} foreign origin`).toBe(403)
        expect((await post(route, { token: tok.admin, origin: null })).status, `${route} no origin`).toBe(403)
      }
      expect(mockMail.calls()).toBe(0)
    })
    it('the query layer refuses an editor and a selector', async () => {
      const id = await campaign()
      for (const who of ['editor', 'selector']) {
        expect(await q.getEmailOverview(user[who])).toBeNull()
        expect(await q.getCampaignPage(user[who], id)).toBeNull()
        expect((await q.createCampaign(user[who], { subject: 's', body: 'b' })).ok).toBe(false)
        expect((await q.startSend(user[who], id, 1)).ok).toBe(false)
        expect((await q.addManualSuppression(user[who], 'x@example.org')).ok).toBe(false)
        expect(await q.runBatchForAdmin(user[who], id)).toBeNull()
      }
    })
    it('over REST nobody but an admin reads the three collections, and nobody writes the send rows', async () => {
      const id = await campaign()
      await sendAll(id)
      for (const slug of ['email-campaigns', 'email-recipients', 'email-suppressions']) {
        expect((await rest('GET', `/${slug}`)).status, `${slug} anonymous`).toBe(403)
        expect((await rest('GET', `/${slug}`, { token: tok.editor })).status, `${slug} editor`).toBe(403)
        expect((await rest('GET', `/${slug}`, { token: tok.selector })).status, `${slug} selector`).toBe(403)
      }
      expect((await rest('GET', '/email-recipients', { token: tok.admin })).status).toBe(200)
      expect((await rest('POST', '/email-recipients', { token: tok.admin, body: { campaign: id, email: 'x@example.org', emailHash: 'x' } })).status).toBe(403)
      expect((await rest('POST', '/email-suppressions', { token: tok.admin, body: { emailHash: 'x', reason: 'manual', at: new Date().toISOString() } })).status).toBe(403)
    })
    it('a campaign that has started cannot be edited or deleted, even by an admin', async () => {
      const id = await campaign()
      expect((await rest('PATCH', `/email-campaigns/${id}`, { token: tok.admin, body: { subject: 'Changed while a draft' } })).status).toBe(200)
      await sendAll(id)
      expect((await rest('PATCH', `/email-campaigns/${id}`, { token: tok.admin, body: { subject: 'Changed after' } })).status).toBeGreaterThanOrEqual(400)
      expect((await rest('DELETE', `/email-campaigns/${id}`, { token: tok.admin })).status).toBeGreaterThanOrEqual(400)
      expect((await q.saveCampaign(user.admin, id, { subject: 'x', body: 'y' }))).toEqual({ ok: false, code: 'not-draft' })
      const row = (await payload.findByID({ collection: 'email-campaigns', id, depth: 0, overrideAccess: true })) as { subject: string }
      expect(row.subject).toBe('Changed while a draft')
    })
    it('the saved audience holds the filter only, even if the request carries a name or an address', async () => {
      const doc = await payload.create({ collection: 'email-campaigns', data: { subject: 's', body: 'b', audience: { q: 'alice@example.org', status: 'active', role: 'player', name: 'Alice', juniors: 'yes' } } as never, user: user.admin, overrideAccess: false, depth: 0 })
      const stored = JSON.stringify((doc as { audience: unknown }).audience)
      expect(stored).not.toMatch(/alice|@/i)
      expect(JSON.parse(stored)).toEqual({ status: 'active', role: 'player', juniors: false, segment: 'none' })
    })
  })

  describe('a campaign', () => {
    it('previews who gets it, then sends once to each distinct address, with the unsubscribe headers and a personal link', async () => {
      const id = await campaign()
      const page = await preview(id)
      // Eli has no address and goes to his guardian Fay's; Fay, a member too, is then the same address, not a fourth copy.
      expect(page.audienceCounts).toMatchObject({ match: 6, willReceive: 3, noEmail: 1, doNotEmail: 1, unsubscribed: 0, viaGuardian: 1, duplicates: 1 })
      expect(page.sentence).toContain('6 match; 3 will receive this')
      expect(page.preview.html).toContain('Sam')
      await sendAll(id)
      const sent = mockMail.sent()
      expect(sent.map((m) => m.to).sort()).toEqual(['alice@example.org', 'bob@example.org', 'fay@example.org'])
      expect(sent.some((m) => m.to === 'cara@example.org' || m.to === 'dan@example.org' || m.to === 'gus@example.org')).toBe(false)
      for (const m of sent) {
        expect(m.headers?.['List-Unsubscribe']).toMatch(/^<http:\/\/localhost:3000\/api\/public\/unsubscribe\/[\w.-]+>$/)
        expect(m.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
        expect(m.from).toEqual({ name: expect.any(String), address: 'club@example.org' })
        expect(m.text).toContain('Unsubscribe: http://localhost:3000/unsubscribe/')
        expect(m.html).toContain('Unsubscribe')
        expect(m.idempotencyKey).toMatch(/^campaign-\d+$/)
      }
      const alice = sent.find((m) => m.to === 'alice@example.org')!
      expect(alice.subject).toBe('Hello Alice')
      const link = /\/volunteer\/([\w.-]+)/.exec(alice.text)![1]
      expect(volunteerTokenMatches(link, ids.alice, 0)).toBe(true)
      const fayMail = sent.find((m) => m.to === 'fay@example.org')!
      expect(fayMail.subject).toBe('Hello Fay')
      const done = await preview(id)
      expect(done.status).toBe('sent')
      expect(done.counts).toEqual({ queued: 0, sent: 3, failed: 0, skipped: 0 })
      const audit = await payload.find({ collection: 'office-audit-log', where: { action: { equals: 'email-send' } }, overrideAccess: true, depth: 0 })
      expect(audit.totalDocs).toBe(1)
      expect(JSON.stringify(audit.docs[0])).not.toMatch(/@|alice/i)
    })
    it('a junior without an address goes to a guardian, addressed by the guardian\'s first name', async () => {
      const id = await campaign({ role: 'player' })
      const page = await preview(id)
      expect(page.audienceCounts).toMatchObject({ match: 2, willReceive: 2, viaGuardian: 1 })
      expect(page.sentence).toContain('1 junior goes to a guardian')
      await sendAll(id)
      const to = mockMail.sent().map((m) => [m.to, m.subject]).sort()
      expect(to).toEqual([['alice@example.org', 'Hello Alice'], ['fay@example.org', 'Hello Fay']])
    })
    it('the confirm step refuses a stale count and an empty audience, and a double press starts it once', async () => {
      const id = await campaign()
      expect(await q.startSend(user.admin, id, 99)).toEqual({ ok: false, code: 'changed' })
      expect(mockMail.calls()).toBe(0)
      const empty = await campaign({ role: 'sponsor-contact' })
      expect(await q.startSend(user.admin, empty, 0)).toEqual({ ok: false, code: 'empty' })
      const [a, b] = await Promise.all([q.startSend(user.admin, id, 3), q.startSend(user.admin, id, 3)])
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
      expect((await recipients(id)).length).toBe(3)
    })
    it('refuses an audience over the cap', async () => {
      vi.stubEnv('EMAIL_MAX_RECIPIENTS', '2')
      const id = await campaign()
      expect((await preview(id)).overCap).toBe(true)
      expect(await q.startSend(user.admin, id, 3)).toEqual({ ok: false, code: 'over-cap' })
    })
    it('an unknown merge tag is refused on create and on edit', async () => {
      expect(await q.createCampaign(user.admin, { subject: 'Hi', body: 'Dear {name}' })).toEqual({ ok: false, code: 'tag' })
      const id = await campaign()
      expect(await q.saveCampaign(user.admin, id, { subject: 'Hi {oops}', body: 'x' })).toEqual({ ok: false, code: 'tag' })
      await expect(payload.update({ collection: 'email-campaigns', id, data: { body: 'Dear {nope}' } as never, user: user.admin, overrideAccess: false })).rejects.toThrow()
    })
    it('segments: volunteers by role, owes-fees by the ids the fee module gives', async () => {
      const volunteers = await core.loadAudience(payload, { status: 'active', role: null, juniors: false, segment: 'volunteers' })
      expect(volunteers.recipients.map((r) => r.email)).toEqual(['alice@example.org'])
      const owes = await core.loadAudience(payload, { status: 'active', role: null, juniors: false, segment: 'owes-fees' }, { owingIds: new Set([ids.bob, ids.dan]) })
      expect(owes.recipients.map((r) => r.email)).toEqual(['bob@example.org'])
      expect((await core.loadAudience(payload, { status: 'active', role: null, juniors: false, segment: 'owes-fees' }, { owingIds: new Set() })).recipients).toEqual([])
    })
    it('an unsubscribe that lands mid-send is honoured: that person is skipped', async () => {
      vi.stubEnv('EMAIL_BATCH_SIZE', '1')
      const id = await campaign()
      const started = await q.startSend(user.admin, id, 3)
      expect(started.ok).toBe(true)
      const first = await q.runBatchFor(id, { sleep: noSleep })
      expect(first).toMatchObject({ sent: 1, remaining: 2 })
      const queued = (await recipients(id)).filter((r) => r.status === 'queued')
      expect(queued).toHaveLength(2)
      const res = await unsubPost(unsubToken(queued[0].id))
      expect(res.status).toBe(200)
      for (let i = 0; i < 5; i++) await q.runBatchFor(id, { sleep: noSleep })
      const final = await recipients(id)
      expect(final.find((r) => r.id === queued[0].id)!.status).toBe('skipped-suppressed')
      expect(mockMail.sent().map((m) => m.to)).not.toContain(queued[0].email)
      expect(mockMail.sent()).toHaveLength(2)
      expect((await preview(id)).counts).toEqual({ queued: 0, sent: 2, failed: 0, skipped: 1 })
    })
    it('the address in the List-Unsubscribe header takes the one-click POST and records the opt-out', async () => {
      const id = await campaign()
      await sendAll(id)
      const mail = mockMail.sent().find((m) => m.to === 'bob@example.org')!
      const href = /^<(.+)>$/.exec(mail.headers!['List-Unsubscribe'])![1]
      const url = new URL(href)
      const token = url.pathname.split('/').pop()!
      expect(url.pathname).toBe(`/api/public/unsubscribe/${token}`)
      const { POST } = await import('@/app/api/public/unsubscribe/[token]/route')
      const res = await POST(new Request(href, { method: 'POST', headers: { 'x-test-ip': '198.51.100.9', 'content-type': 'application/x-www-form-urlencoded' }, body: mail.headers!['List-Unsubscribe-Post'] }), { params: Promise.resolve({ token }) })
      expect(res.status).toBe(200)
      expect(await suppressed('bob@example.org')).toBe(1)
    })
    it('hard-deleting a member with no records blanks the address held on their sent rows', async () => {
      const id = await campaign()
      await sendAll(id)
      await payload.delete({ collection: 'members', id: ids.bob, overrideAccess: true })
      const rows = await recipients(id)
      expect(rows.some((r) => r.email === 'bob@example.org')).toBe(false)
      expect(rows.filter((r) => r.status === 'sent')).toHaveLength(3)
    })
    it('Stop sending ends the batch already running', async () => {
      vi.stubEnv('EMAIL_BATCH_SIZE', '50')
      const id = await campaign()
      await q.startSend(user.admin, id, 3)
      let sleeps = 0
      const stopAfterFirst = async () => {
        sleeps += 1
        if (sleeps === 1) await q.stopSend(user.admin, id)
      }
      const r = await q.runBatchFor(id, { sleep: stopAfterFirst })
      expect(r).toMatchObject({ sent: 1, stopped: true })
      expect(mockMail.sent()).toHaveLength(1)
      expect((await recipients(id)).filter((x) => x.status === 'sending')).toHaveLength(0)
      expect((await preview(id)).status).toBe('cancelled')
    })
    it('a person marked do-not-email after the audience was frozen is skipped too', async () => {
      vi.stubEnv('EMAIL_BATCH_SIZE', '1')
      const id = await campaign()
      await q.startSend(user.admin, id, 3)
      await q.runBatchFor(id, { sleep: noSleep })
      await payload.update({ collection: 'members', id: ids.fay, data: { doNotEmail: true } as never, overrideAccess: true })
      await payload.update({ collection: 'members', id: ids.bob, data: { doNotEmail: true } as never, overrideAccess: true })
      for (let i = 0; i < 4; i++) await q.runBatchFor(id, { sleep: noSleep })
      expect(mockMail.sent().map((m) => m.to)).toEqual(['alice@example.org'])
    })
    it('a transient failure retries later and then succeeds; a permanent one is final', async () => {
      const id = await campaign({ role: 'volunteer' })
      await q.startSend(user.admin, id, 1)
      mockMail.failNext('transient')
      const first = await q.runBatchFor(id, { sleep: noSleep })
      expect(first).toMatchObject({ sent: 0, retrying: 1, remaining: 1 })
      const [r1] = await recipients(id)
      expect(r1).toMatchObject({ status: 'queued', attempts: 1 })
      // Not due yet: a batch right now does nothing.
      expect(await q.runBatchFor(id, { sleep: noSleep })).toMatchObject({ processed: 0 })
      await rows(sql`UPDATE "payload"."email_recipients" SET next_attempt_at = now() - interval '1 minute' WHERE campaign_id = ${id}`)
      expect(await q.runBatchFor(id, { sleep: noSleep })).toMatchObject({ sent: 1, remaining: 0, status: 'sent' })
      expect(mockMail.sent()).toHaveLength(1)

      mockMail.reset()
      const id2 = await campaign({ role: 'volunteer' })
      await q.startSend(user.admin, id2, 1)
      mockMail.failNext('permanent')
      expect(await q.runBatchFor(id2, { sleep: noSleep })).toMatchObject({ failed: 1, remaining: 0, status: 'sent' })
      expect((await recipients(id2))[0].status).toBe('failed')
      expect(await q.runBatchFor(id2, { sleep: noSleep })).toMatchObject({ processed: 0 })
      expect(mockMail.sent()).toHaveLength(0)
    })
    it('gives up after three transient failures', async () => {
      const id = await campaign({ role: 'volunteer' })
      await q.startSend(user.admin, id, 1)
      for (let i = 0; i < 3; i++) {
        mockMail.failNext('transient')
        await q.runBatchFor(id, { sleep: noSleep })
        await rows(sql`UPDATE "payload"."email_recipients" SET next_attempt_at = now() - interval '1 minute' WHERE campaign_id = ${id} AND status = 'queued'`)
      }
      const [r] = await recipients(id)
      expect(r.status).toBe('failed')
      expect(r.attempts).toBe(3)
      expect((await preview(id)).status).toBe('sent')
    })
    it('a provider that refuses the key pauses sending without using up tries', async () => {
      const id = await campaign()
      await q.startSend(user.admin, id, 3)
      mockMail.failNext('auth')
      const r = await q.runBatchFor(id, { sleep: noSleep })
      expect(r).toMatchObject({ stopped: true, sent: 0 })
      const all = await recipients(id)
      expect(all.every((x) => x.status === 'queued' && x.attempts === 0)).toBe(true)
      expect((await preview(id)).status).toBe('sending')
    })
    it('two workers at once never send the same person twice', async () => {
      await clearCollection(payload, 'members')
      for (let i = 0; i < 30; i++) await member(`m${i}`, { firstName: `M${i}`, lastName: 'Test', email: `m${i}@example.org` })
      vi.stubEnv('EMAIL_BATCH_SIZE', '4')
      const id = await campaign()
      expect((await q.startSend(user.admin, id, 30)).ok).toBe(true)
      for (let round = 0; round < 12; round++) {
        await Promise.all([q.runBatchFor(id, { sleep: noSleep }), q.runBatchFor(id, { sleep: noSleep }), q.runBatchFor(id, { sleep: noSleep })])
      }
      const to = mockMail.sent().map((m) => m.to)
      expect(new Set(to).size).toBe(30)
      expect(to).toHaveLength(30)
      expect(mockMail.calls()).toBe(30)
      expect((await preview(id)).counts).toMatchObject({ sent: 30, queued: 0 })
    })
    it('a worker that died holding a claim is recovered after the lease, and the provider key stops a double delivery', async () => {
      const id = await campaign({ role: 'volunteer' })
      await q.startSend(user.admin, id, 1)
      await rows(sql`UPDATE "payload"."email_recipients" SET status = 'sending', claim_token = 'dead', claimed_at = now() - interval '30 minutes', attempts = 1 WHERE campaign_id = ${id}`)
      expect(await q.runBatchFor(id, { sleep: noSleep })).toMatchObject({ sent: 1 })
      // A live claim is left alone.
      const id2 = await campaign({ role: 'volunteer' })
      await q.startSend(user.admin, id2, 1)
      await rows(sql`UPDATE "payload"."email_recipients" SET status = 'sending', claim_token = 'live', claimed_at = now() WHERE campaign_id = ${id2}`)
      expect(await q.runBatchFor(id2, { sleep: noSleep })).toMatchObject({ processed: 0 })
    })
    it('"send me a copy" goes only to the signed-in admin, marked [TEST], with no recipient rows and no counts', async () => {
      const id = await campaign()
      expect(await q.sendTestCopy(user.admin, id)).toEqual({ ok: true, notice: 'test-sent' })
      expect(mockMail.sent()).toHaveLength(1)
      expect(mockMail.sent()[0].to).toBe('admin@example.com')
      expect(mockMail.sent()[0].subject).toMatch(/^\[TEST\] Hello /)
      expect(await recipients(id)).toHaveLength(0)
      expect((await preview(id)).counts).toEqual({ queued: 0, sent: 0, failed: 0, skipped: 0 })
      expect((await q.sendTestCopy(user.editor, id)).ok).toBe(false)
      expect(mockMail.sent()).toHaveLength(1)
    })
    it('stopping ends sending: what is left is never sent', async () => {
      vi.stubEnv('EMAIL_BATCH_SIZE', '1')
      const id = await campaign()
      await q.startSend(user.admin, id, 3)
      await q.runBatchFor(id, { sleep: noSleep })
      expect(await q.stopSend(user.admin, id)).toEqual({ ok: true, notice: 'stopped' })
      expect(await q.runBatchFor(id, { sleep: noSleep })).toMatchObject({ processed: 0, status: 'cancelled' })
      expect(mockMail.sent()).toHaveLength(1)
    })
    it('the REST routes drive the same flow', async () => {
      const made = await post('/api/admin/office/email/new', { token: tok.admin, form: { subject: 'Route {firstName|there}', body: 'Hi', status: 'active' } })
      expect(made.status).toBe(303)
      const id = Number(/email\/(\d+)/.exec(made.headers.get('Location')!)![1])
      expect((await post(`/api/admin/office/email/${id}/test`, { token: tok.admin })).headers.get('Location')).toContain('notice=test-sent')
      expect((await post(`/api/admin/office/email/${id}/send`, { token: tok.admin, form: { expected: '1' } })).headers.get('Location')).toContain('error=changed')
      expect((await post(`/api/admin/office/email/${id}/send`, { token: tok.admin, form: { expected: '3' } })).headers.get('Location')).toContain('notice=started')
      const batch = await post(`/api/admin/office/email/${id}/batch`, { token: tok.admin })
      expect(await batch.json()).toMatchObject({ ok: true, sent: 3, remaining: 0, status: 'sent' })
    })
  })

  describe('the schedule', () => {
    const cron = async (auth?: string) => {
      const { GET } = await import('@/app/api/cron/email-batch/route')
      return GET(new Request(`${ORIGIN}/api/cron/email-batch`, { headers: auth ? { authorization: auth } : {} }))
    }
    it('needs the secret, finishes a campaign nobody is watching, and purges nothing early', async () => {
      const id = await campaign()
      await q.startSend(user.admin, id, 3)
      expect((await cron()).status).toBe(401)
      expect((await cron('Bearer wrong')).status).toBe(401)
      expect((await cron('Bearer undefined')).status).toBe(401)
      expect(mockMail.calls()).toBe(0)
      const ok = await cron('Bearer local-test')
      expect(ok.status).toBe(200)
      expect(await ok.json()).toMatchObject({ sent: 3, purgedCampaigns: 0 })
      expect((await preview(id)).status).toBe('sent')
      expect((await recipients(id)).every((r) => r.email)).toBe(true)
    })
    it('blanks the addresses of a finished email after the retention period and keeps the status, hash and counts', async () => {
      const id = await campaign()
      await sendAll(id)
      await rows(sql`UPDATE "payload"."email_campaigns" SET sent_at = now() - interval '29 days' WHERE id = ${id}`)
      expect(await core.purgeExpiredRecipients(payload, 30)).toEqual({ campaigns: 0 })
      await rows(sql`UPDATE "payload"."email_campaigns" SET sent_at = now() - interval '31 days' WHERE id = ${id}`)
      expect(await core.purgeExpiredRecipients(payload, 30)).toEqual({ campaigns: 1 })
      const after = await recipients(id)
      expect(after).toHaveLength(3)
      for (const r of after) expect(r).toMatchObject({ email: null, first_name: null, status: 'sent' })
      expect(after.every((r) => /^[0-9a-f]{64}$/.test(r.email_hash))).toBe(true)
      expect((await preview(id)).counts.sent).toBe(3)
      expect((await preview(id)).purged).toBe(true)
      expect(await core.purgeExpiredRecipients(payload, 30)).toEqual({ campaigns: 0 })
    })
    it('a link in an old email still works after its addresses were purged, and suppresses by hash', async () => {
      const id = await campaign()
      await sendAll(id)
      const bob = (await recipients(id)).find((r) => r.email === 'bob@example.org')!
      await rows(sql`UPDATE "payload"."email_campaigns" SET sent_at = now() - interval '40 days' WHERE id = ${id}`)
      await core.purgeExpiredRecipients(payload, 30)
      expect((await unsubPost(unsubToken(bob.id))).status).toBe(200)
      expect(await suppressed('bob@example.org')).toBe(1)
      const row = (await payload.find({ collection: 'email-suppressions', where: { emailHash: { equals: emailHash('bob@example.org') } }, overrideAccess: true, depth: 0 })).docs[0] as { email?: string | null; reason: string }
      expect(row.email ?? null).toBeNull()
      expect(row.reason).toBe('unsubscribed')
    })
  })

  describe('the public opt-out', () => {
    const sentRecipient = async (email: string) => {
      const id = await campaign()
      await sendAll(id)
      return { id, rec: (await recipients(id)).find((r) => r.email === email)! }
    }
    it('opening the page never writes; only the button does, once', async () => {
      const { rec } = await sentRecipient('bob@example.org')
      const token = unsubToken(rec.id)
      const Page = (await import('@/app/(frontend)/unsubscribe/[token]/page')).default
      const el = (await Page({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) })) as { props: unknown }
      expect(JSON.stringify(el.props)).toContain('b***@example.org')
      expect(JSON.stringify(el.props)).not.toContain('bob@example.org')
      expect(await suppressed('bob@example.org')).toBe(0)
      const { unsubscribeAction } = await import('@/app/(frontend)/unsubscribe/[token]/actions')
      const form = new FormData()
      form.set('token', token)
      await expect(unsubscribeAction(form)).rejects.toMatchObject({ to: `/unsubscribe/${token}?r=done` })
      await expect(unsubscribeAction(form)).rejects.toMatchObject({ to: `/unsubscribe/${token}?r=done` })
      expect(await suppressed('bob@example.org')).toBe(1)
      const again = (await Page({ params: Promise.resolve({ token }), searchParams: Promise.resolve({ r: 'done' }) })) as { props: unknown }
      expect(JSON.stringify(again.props)).toContain('You are unsubscribed')
    })
    it('the one-click POST writes the opt-out at once and is idempotent', async () => {
      const { rec } = await sentRecipient('alice@example.org')
      const token = unsubToken(rec.id)
      expect((await unsubPost(token)).status).toBe(200)
      expect((await unsubPost(token)).status).toBe(200)
      expect(await suppressed('alice@example.org')).toBe(1)
      // A client that opens the one-click address lands on the confirm page; nothing is changed by a GET.
      const { GET } = await import('@/app/api/public/unsubscribe/[token]/route')
      const g = await GET(new Request(`${ORIGIN}/api/public/unsubscribe/${token}`), { params: Promise.resolve({ token }) })
      expect(g.status).toBe(303)
      expect(g.headers.get('location')).toBe(`/unsubscribe/${token}`)
    })
    it('resending skips the person who opted out', async () => {
      const { rec } = await sentRecipient('bob@example.org')
      await unsubPost(unsubToken(rec.id))
      mockMail.reset()
      const id2 = await campaign()
      const page = await preview(id2)
      expect(page.audienceCounts).toMatchObject({ willReceive: 2, unsubscribed: 1 })
      await sendAll(id2)
      expect(mockMail.sent().map((m) => m.to).sort()).toEqual(['alice@example.org', 'fay@example.org'])
    })
    it('a valid link is never limited: 100 posts from one address all succeed, even after bad attempts from it', async () => {
      const { rec } = await sentRecipient('bob@example.org')
      const token = unsubToken(rec.id)
      for (let i = 0; i < 40; i++) expect((await unsubPost(`bad${i}.token`, '192.0.2.50')).status).toBe(404)
      expect((await isLocked(payload, 'unsub-bad:ip:192.0.2.50')).allowed).toBe(false)
      for (let i = 0; i < 100; i++) expect((await unsubPost(token, '192.0.2.50')).status).toBe(200)
      expect(await suppressed('bob@example.org')).toBe(1)
    })
    it('only links that fail to check are counted, and a bad link looks the same whatever the reason', async () => {
      const { rec } = await sentRecipient('bob@example.org')
      for (let i = 0; i < 5; i++) await unsubPost(unsubToken(rec.id), '192.0.2.60')
      expect((await isLocked(payload, 'unsub-bad:ip:192.0.2.60')).allowed).toBe(true)
      const tampered = `${unsubToken(rec.id).split('.')[0]}.AAAA`
      const missing = unsubToken(999999)
      for (const t of [tampered, missing, 'garbage']) {
        const res = await unsubPost(t, '192.0.2.61')
        expect(res.status).toBe(404)
        expect(await res.text()).toBe('Not found')
      }
      const Page = (await import('@/app/(frontend)/unsubscribe/[token]/page')).default
      const el = (await Page({ params: Promise.resolve({ token: tampered }), searchParams: Promise.resolve({}) })) as { props: unknown }
      expect(JSON.stringify(el.props)).toContain('Link not recognised')
    })
    it('undo removes an unsubscribe but never a bounce, a complaint or an admin entry; the undo button has its own limit', async () => {
      const { rec } = await sentRecipient('bob@example.org')
      const token = unsubToken(rec.id)
      await unsubPost(token)
      const target = (await unsub.resolveUnsub(payload, token, '192.0.2.70'))!
      expect(target.unsubscribed).toBe(true)
      expect(await unsub.undo(payload, target, '192.0.2.70')).toBe('undone')
      expect(await suppressed('bob@example.org')).toBe(0)
      // A bounce is not cleared by the link's undo.
      await payload.create({ collection: 'email-suppressions', data: { emailHash: emailHash('bob@example.org'), email: 'bob@example.org', reason: 'bounced', source: 'test', at: new Date().toISOString() } as never, overrideAccess: true })
      expect(await unsub.undo(payload, target, '192.0.2.70')).toBe('undone')
      expect(await suppressed('bob@example.org')).toBe(1)
      for (let i = 0; i < 70; i++) await unsub.undo(payload, target, '192.0.2.71')
      expect(await unsub.undo(payload, target, '192.0.2.71')).toBe('busy')
    })
    it('admins can add and allow an address, and both are logged without the address', async () => {
      expect((await post('/api/admin/office/email/suppression/add', { token: tok.admin, form: { email: 'Manual@Example.org' } })).headers.get('Location')).toContain('notice=suppression-added')
      expect(await suppressed('manual@example.org')).toBe(1)
      expect((await post('/api/admin/office/email/suppression/add', { token: tok.admin, form: { email: 'not an address' } })).headers.get('Location')).toContain('error=address')
      const row = (await payload.find({ collection: 'email-suppressions', where: { reason: { equals: 'manual' } }, overrideAccess: true, depth: 0 })).docs[0]
      expect((await post('/api/admin/office/email/suppression/remove', { token: tok.admin, form: { id: String(row.id) } })).headers.get('Location')).toContain('notice=suppression-removed')
      expect(await suppressed('manual@example.org')).toBe(0)
      const audit = await payload.find({ collection: 'office-audit-log', where: { action: { equals: 'bulk-change' } }, overrideAccess: true, depth: 0 })
      expect(audit.totalDocs).toBe(2)
      expect(JSON.stringify(audit.docs)).not.toMatch(/manual@|@example/)
    })
  })

  describe('privacy', () => {
    it('after a member\'s details are removed, their address appears in no table except the unsubscribe list', async () => {
      const id = await campaign()
      await sendAll(id)
      const rec = (await recipients(id)).find((r) => r.email === 'alice@example.org')!
      await unsubPost(unsubToken(rec.id))
      const { eraseMemberDetails } = await import('@/lib/office/erase')
      expect(await eraseMemberDetails(payload, user.admin, ids.alice)).toEqual({ ok: true })
      const tables = (await rows(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'payload' AND table_type = 'BASE TABLE'`)).map((r) => String(r.table_name))
      const holding: string[] = []
      for (const t of tables) {
        const n = (await rows(sql.raw(`SELECT count(*)::int AS n FROM "payload"."${t}" x WHERE x::text ILIKE '%alice@example.org%' OR x::text ILIKE '%Alice%'`)))[0].n as number
        if (n > 0) holding.push(t)
      }
      expect(holding).toEqual(['email_suppressions'])
      const after = (await recipients(id)).find((r) => r.id === rec.id)!
      expect(after).toMatchObject({ email: null, first_name: null, status: 'sent' })
      // The old personal volunteer link no longer works.
      const m = (await payload.findByID({ collection: 'members', id: ids.alice, depth: 0, overrideAccess: true })) as { volunteerLinkVersion?: number }
      expect(m.volunteerLinkVersion).toBeGreaterThan(0)
    })
    it('archiving or marking do-not-email retires the personal link in an email already sent', async () => {
      const id = await campaign()
      await sendAll(id)
      const mail = mockMail.sent().find((m) => m.to === 'bob@example.org')!
      const link = /\/volunteer\/([\w.-]+)/.exec(mail.text)![1]
      const { resolveVolunteer } = await import('@/lib/volunteer-public')
      expect(await resolveVolunteer(payload, link)).not.toBeNull()
      await payload.update({ collection: 'members', id: ids.bob, data: { doNotEmail: true } as never, overrideAccess: true })
      expect(await resolveVolunteer(payload, link)).toBeNull()
    })
    it('the audit log of an email send holds counts and filter words only', async () => {
      const id = await campaign({ role: 'volunteer' })
      await sendAll(id)
      const row = (await payload.find({ collection: 'office-audit-log', where: { action: { equals: 'email-send' } }, overrideAccess: true, depth: 0 })).docs[0] as { summary: Record<string, unknown>; rowCount: number }
      expect(row.summary).toEqual({ status: 'active', role: 'volunteer', juniors: false, segment: 'none', willReceive: 1 })
      expect(row.rowCount).toBe(1)
    })
  })
})
