import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, resetGlobal, rest, tokenFor } from './helpers'

// Route handlers call next/cache directly; it throws outside a Next request.
const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

// Spec §15 access.int — WP1 starts it with the `users` cases; later WPs extend it.
describe('access: users', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
  })

  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('refuses POST /api/users/first-register on an EMPTY users table', async () => {
    expect(await payload.count({ collection: 'users' })).toEqual({ totalDocs: 0 })
    const res = await rest('POST', '/users/first-register', {
      body: { email: 'attacker@example.com', password: 'attacker-pass-1' },
    })
    expect(res.status).toBe(403)
    expect(await payload.count({ collection: 'users' })).toEqual({ totalDocs: 0 })
  })

  it('refuses an anonymous Local API create without the seed context', async () => {
    await expect(
      payload.create({ collection: 'users', data: { email: 'x@example.com', password: 'x-pass-12345', role: 'editor' }, context: { disableRevalidate: true } }),
    ).rejects.toThrow()
  })

  it('lets seed-admin (context.seedAdmin) create the first admin', async () => {
    const admin = await payload.create({
      collection: 'users',
      data: { email: 'admin@example.com', password: 'admin-pass-123', role: 'admin' },
      context: { seedAdmin: true, disableRevalidate: true },
    })
    expect(admin.role).toBe('admin')
  })

  it('refuses anonymous REST create once users exist', async () => {
    const res = await rest('POST', '/users', { body: { email: 'y@example.com', password: 'y-pass-12345' } })
    expect(res.status).toBe(403)
  })

  it('an editor cannot raise their own role or read other users', async () => {
    const adminLogin = await rest('POST', '/users/login', { body: { email: 'admin@example.com', password: 'admin-pass-123' } })
    expect(adminLogin.status).toBe(200)
    const created = await rest('POST', '/users', {
      token: adminLogin.json.token,
      body: { email: 'editor@example.com', password: 'editor-pass-123', role: 'editor' },
    })
    expect(created.status).toBe(201)
    const editorId = created.json.doc.id

    const login = await rest('POST', '/users/login', { body: { email: 'editor@example.com', password: 'editor-pass-123' } })
    const token = login.json.token as string
    const patch = await rest('PATCH', `/users/${editorId}`, { token, body: { role: 'admin', name: 'Ed' } })
    expect(patch.status).toBe(200)
    const after = await payload.findByID({ collection: 'users', id: editorId })
    expect(after.role).toBe('editor')
    expect(after.name).toBe('Ed')

    const list = await rest('GET', '/users', { token })
    expect(list.json.docs.map((u: { email: string }) => u.email)).toEqual(['editor@example.com'])
  })

  it('only an admin can unlock a user', async () => {
    const editor = await rest('POST', '/users/login', { body: { email: 'editor@example.com', password: 'editor-pass-123' } })
    const denied = await rest('POST', '/users/unlock', { token: editor.json.token, body: { email: 'admin@example.com' } })
    expect(denied.status).toBe(403)
    const access = await rest('GET', '/access', { token: editor.json.token })
    // /api/access strips denied permissions; before the fix it reported "unlock": true.
    expect(access.json.collections.users.unlock).toBeUndefined()
    expect((await rest('POST', '/users/unlock', { body: { email: 'admin@example.com' } })).status).toBe(403)

    const admin = await rest('POST', '/users/login', { body: { email: 'admin@example.com', password: 'admin-pass-123' } })
    const ok = await rest('POST', '/users/unlock', { token: admin.json.token, body: { email: 'editor@example.com' } })
    expect(ok.status).toBe(200)
  })

  it('forgot-password is disabled (no email adapter; it would log the reset token)', async () => {
    const before = await payload.find({ collection: 'users', where: { email: { equals: 'admin@example.com' } }, showHiddenFields: true })
    const res = await rest('POST', '/users/forgot-password', { body: { email: 'admin@example.com' } })
    expect(res.status).toBe(403)
    const after = await payload.find({ collection: 'users', where: { email: { equals: 'admin@example.com' } }, showHiddenFields: true })
    expect(after.docs[0].resetPasswordToken ?? null).toBe(before.docs[0].resetPasswordToken ?? null)
  })

  it('anonymous REST cannot list users', async () => {
    const res = await rest('GET', '/users')
    expect(res.status).toBe(403)
  })
})

// WP2: the simple content collections and the two globals.
describe('access: club content (WP2)', () => {
  let payload: Payload
  let editor: string
  let admin: string
  const ids: Record<string, number> = {}
  const ctx = { disableRevalidate: true }

  beforeAll(async () => {
    payload = await getTestPayload()
    for (const c of ['documents', 'gallery-photos', 'sponsors', 'people', 'announcements'] as const) await clearCollection(payload, c)
    await resetGlobal(payload, 'club')
    editor = await tokenFor(payload, 'editor', 'wp2-editor@example.com')
    admin = await tokenFor(payload, 'admin', 'wp2-admin@example.com')
    ids.documents = (await payload.create({ collection: 'documents', data: { title: 'Doc', category: 'Policies' }, context: ctx })).id
    ids['gallery-photos'] = (await payload.create({ collection: 'gallery-photos', data: { caption: 'x' }, context: ctx })).id
    ids.sponsors = (await payload.create({ collection: 'sponsors', data: { name: 'S', tier: 'Gold' }, context: ctx })).id
    ids.people = (await payload.create({ collection: 'people', data: { name: 'P', role: 'R' }, context: ctx })).id
    ids.announcements = (await payload.create({ collection: 'announcements', data: { title: 'Draft', published: false }, context: ctx })).id
  })

  afterAll(async () => {
    await resetGlobal(payload, 'club')
    await destroyTestPayload(payload)
  })

  const BODIES: Record<string, Record<string, unknown>> = {
    documents: { title: 'New', category: 'Policies' },
    'gallery-photos': { caption: 'New' },
    sponsors: { name: 'New', tier: 'Bronze' },
    people: { name: 'New', role: 'Coach' },
    announcements: { title: 'New' },
  }

  for (const c of Object.keys(BODIES)) {
    it(`anonymous REST cannot create, update or delete ${c}`, async () => {
      expect((await rest('POST', `/${c}`, { body: BODIES[c] })).status).toBe(403)
      expect((await rest('PATCH', `/${c}/${ids[c]}`, { body: BODIES[c] })).status).toBe(403)
      expect((await rest('DELETE', `/${c}/${ids[c]}`)).status).toBe(403)
      expect(await payload.count({ collection: c as 'sponsors' })).toEqual({ totalDocs: 1 })
    })

    it(`an editor can create, update and delete ${c}`, async () => {
      const created = await rest('POST', `/${c}`, { token: editor, body: BODIES[c] })
      expect(created.status).toBe(201)
      expect((await rest('PATCH', `/${c}/${created.json.doc.id}`, { token: editor, body: BODIES[c] })).status).toBe(200)
      expect((await rest('DELETE', `/${c}/${created.json.doc.id}`, { token: editor })).status).toBe(200)
    })
  }

  it('anonymous REST reads public content, but never an unpublished announcement', async () => {
    for (const c of ['documents', 'gallery-photos', 'sponsors', 'people']) {
      const res = await rest('GET', `/${c}`)
      expect(res.status).toBe(200)
      expect(res.json.totalDocs).toBe(1)
    }
    expect((await rest('GET', '/announcements')).json.totalDocs).toBe(0)
    expect((await rest('GET', `/announcements/${ids.announcements}`)).status).toBe(404)
  })

  it('club global: anyone reads, only an admin updates', async () => {
    expect((await rest('GET', '/globals/club')).status).toBe(200)
    expect((await rest('POST', '/globals/club', { body: { name: 'Hacked' } })).status).toBe(403)
    expect((await rest('POST', '/globals/club', { token: editor, body: { name: 'Edited' } })).status).toBe(403)
    const ok = await rest('POST', '/globals/club', { token: admin, body: { name: 'Admin CC' } })
    expect(ok.status).toBe(200)
    expect(ok.json.result.name).toBe('Admin CC')
  })

  it('site-settings global: anonymous cannot update, an editor can', async () => {
    expect((await rest('POST', '/globals/site-settings', { body: { sponsorCarouselTiers: ['Gold'] } })).status).toBe(403)
    expect((await rest('POST', '/globals/site-settings', { token: editor, body: { sponsorCarouselTiers: ['Gold'] } })).status).toBe(200)
    await resetGlobal(payload, 'site-settings')
  })

  it('the admin PlayHQ refresh route needs a staff session and a same-origin POST', async () => {
    const { POST } = await import('@/app/api/admin/playhq-refresh/route')
    const call = (headers: Record<string, string>) => POST(new Request('http://localhost:3000/api/admin/playhq-refresh', { method: 'POST', headers }))
    expect((await call({ origin: 'http://localhost:3000' })).status).toBe(401)
    expect((await call({ origin: 'https://evil.example', Authorization: `JWT ${editor}` })).status).toBe(403)
    expect((await call({ Authorization: `JWT ${editor}` })).status).toBe(403)
    const ok = await call({ origin: 'http://localhost:3000', Authorization: `JWT ${editor}` })
    expect(ok.status).toBe(200)
    expect((await ok.json()).ok).toBe(true)
    expect(cache.revalidateTag).toHaveBeenCalledWith('playhq', 'max')
    expect(cache.revalidatePath).toHaveBeenCalledWith('/fixtures')
    expect(cache.revalidatePath).toHaveBeenCalledWith('/fixtures/[gameId]', 'page')
  })
})

// WP3: events, RSVPs, event photos (spec §2, §15 leak-path cases).
describe('access: events (WP3)', () => {
  let payload: Payload
  let editor: string
  const ctx = { disableRevalidate: true }
  let eventId: number
  let rsvpId: number
  let approvedId: number
  let pendingId: number
  const TOKEN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

  beforeAll(async () => {
    payload = await getTestPayload()
    for (const c of ['event-photos', 'event-rsvps', 'events'] as const) await clearCollection(payload, c)
    editor = await tokenFor(payload, 'editor', 'wp3-editor@example.com')
    eventId = (await payload.create({ collection: 'events', data: { type: 'one_time', title: 'E', eventDate: '2026-09-12T00:00:00.000Z' }, context: ctx })).id
    rsvpId = (
      await payload.create({
        collection: 'event-rsvps',
        data: { event: eventId, response: 'yes', occurrenceDate: '2026-09-12T18:30:00.000Z', name: 'Pat Private', email: 'pat@example.com', note: 'secret', editToken: TOKEN },
        context: ctx,
      })
    ).id
    approvedId = (await payload.create({ collection: 'event-photos', data: { event: eventId, status: 'approved', submitterName: 'Shown Nowhere' }, context: ctx })).id
    pendingId = (await payload.create({ collection: 'event-photos', data: { event: eventId, status: 'pending', submitterName: 'Anon Submitter' }, context: ctx })).id
  })

  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  const BODIES: Record<string, () => Record<string, unknown>> = {
    events: () => ({ type: 'one_time', title: 'New', eventDate: '2026-12-01T00:00:00.000Z' }),
    'event-rsvps': () => ({ event: eventId, occurrenceDate: '2026-09-12T18:30:00.000Z', name: 'New' }),
    'event-photos': () => ({ event: eventId, caption: 'New' }),
  }
  const existing = () => ({ events: eventId, 'event-rsvps': rsvpId, 'event-photos': approvedId }) as Record<string, number>

  for (const c of Object.keys(BODIES)) {
    it(`anonymous REST cannot create, update or delete ${c}`, async () => {
      const id = existing()[c]
      expect((await rest('POST', `/${c}`, { body: BODIES[c]() })).status).toBe(403)
      expect((await rest('PATCH', `/${c}/${id}`, { body: { title: 'x', name: 'x', caption: 'x' } })).status).toBe(403)
      expect((await rest('DELETE', `/${c}/${id}`)).status).toBe(403)
    })

    it(`an editor can create, update and delete ${c}`, async () => {
      const created = await rest('POST', `/${c}`, { token: editor, body: BODIES[c]() })
      expect(created.status).toBe(201)
      expect((await rest('PATCH', `/${c}/${created.json.doc.id}`, { token: editor, body: {} })).status).toBe(200)
      expect((await rest('DELETE', `/${c}/${created.json.doc.id}`, { token: editor })).status).toBe(200)
    })
  }

  it('anonymous cannot read RSVPs at all (names, emails, notes, tokens)', async () => {
    expect((await rest('GET', '/event-rsvps')).status).toBe(403)
    expect((await rest('GET', `/event-rsvps/${rsvpId}`)).status).toBe(403)
    expect((await rest('GET', `/event-rsvps?where[editToken][equals]=${TOKEN}`)).status).toBe(403)
  })

  it('GET /api/events?depth=1 (and the joins) carry no RSVP data or pending photos anonymously', async () => {
    for (const path of ['/events?depth=1', `/events/${eventId}?depth=1`]) {
      const res = await rest('GET', path)
      expect(res.status).toBe(200)
      const body = JSON.stringify(res.json)
      expect(body).not.toContain('Pat Private')
      expect(body).not.toContain('pat@example.com')
      expect(body).not.toContain(TOKEN)
      expect(body).not.toContain('Anon Submitter')
      const doc = path.includes('?depth') && res.json.docs ? res.json.docs[0] : res.json
      expect(doc.rsvps?.docs ?? []).toEqual([])
      expect((doc.photos?.docs ?? []).map((p: { id: number } | number) => (typeof p === 'number' ? p : p.id))).not.toContain(pendingId)
    }
  })

  it('event photos: anonymous sees only approved rows, never submitterName, and cannot filter on it', async () => {
    const all = await rest('GET', '/event-photos')
    expect(all.json.docs.map((d: { id: number }) => d.id)).toEqual([approvedId])
    expect(all.json.docs[0]).not.toHaveProperty('submitterName')
    expect((await rest('GET', '/event-photos?where[status][equals]=pending')).json.totalDocs).toBe(0)
    expect((await rest('GET', `/event-photos/${pendingId}`)).status).toBe(404)
    const probe = await rest('GET', '/event-photos?where[submitterName][like]=Shown')
    expect(probe.status === 200 ? probe.json.totalDocs : 0).toBe(0)
    // Staff see everything, including submitterName.
    const staff = await rest('GET', '/event-photos', { token: editor })
    expect(staff.json.totalDocs).toBe(2)
    expect(staff.json.docs.some((d: { submitterName?: string }) => d.submitterName === 'Anon Submitter')).toBe(true)
  })

  it('an editor cannot read-sort-filter past field access to change a token: editToken is not writable over REST', async () => {
    const res = await rest('PATCH', `/event-rsvps/${rsvpId}`, { token: editor, body: { editToken: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } })
    expect(res.status).toBe(200)
    expect(res.json.doc.editToken).toBe(TOKEN)
  })

  it('the public events upload route answers 503 without a Blob store', async () => {
    const { POST } = await import('@/app/api/public/events/upload/route')
    const res = await POST(new Request('http://localhost:3000/api/public/events/upload', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(503)
  })
})

/** A minimal valid Lexical story body. */
const lex = (text: string): never => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: null,
    children: [
      { type: 'paragraph', format: '', indent: 0, version: 1, direction: null, textFormat: 0, textStyle: '', children: [{ type: 'text', text, format: 0, mode: 'normal', style: '', detail: 0, version: 1 }] },
    ],
  },
}) as never

describe('access: stories (WP4)', () => {
  let payload: Payload
  let editor: string
  const ctx = { disableRevalidate: true }
  let publishedId: number
  let pendingId: number
  let pendingMediaId: number
  const EDIT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const VIEW = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'stories')
    editor = await tokenFor(payload, 'editor', 'wp4-editor@example.com')
    publishedId = (
      await payload.create({
        collection: 'stories',
        data: { title: 'Public story', content: lex('Hello'), authorName: 'Ann', authorEmail: 'ann@example.com', status: 'published', editToken: EDIT, viewToken: VIEW },
        context: ctx,
      })
    ).id
    pendingId = (
      await payload.create({ collection: 'stories', data: { title: 'Pending story', content: lex('Wait'), authorName: 'Bob', status: 'pending' }, context: ctx })
    ).id
    pendingMediaId = (
      await payload.create({
        collection: 'media',
        data: { filename: `wp4-pending-${Date.now()}.jpg`, prefix: 'stories/pending', mimeType: 'image/jpeg', filesize: 10, focalX: 50, focalY: 50 },
        context: ctx,
      })
    ).id
  })

  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('anonymous REST cannot create, update or delete stories; an editor can', async () => {
    expect((await rest('POST', '/stories', { body: { title: 'x', content: lex('x'), authorName: 'x' } })).status).toBe(403)
    expect((await rest('PATCH', `/stories/${publishedId}`, { body: { title: 'x' } })).status).toBe(403)
    expect((await rest('DELETE', `/stories/${publishedId}`)).status).toBe(403)
    const created = await rest('POST', '/stories', { token: editor, body: { title: 'By staff', content: lex('x'), authorName: 'Staff' } })
    expect(created.status).toBe(201)
    expect(created.json.doc).toMatchObject({ status: 'published', submittedByAdmin: true })
    expect((await rest('DELETE', `/stories/${created.json.doc.id}`, { token: editor })).status).toBe(200)
  })

  it('anonymous sees only published stories, never tokens or authorEmail', async () => {
    const list = await rest('GET', '/stories')
    expect(list.json.docs.map((d: { id: number }) => d.id)).toEqual([publishedId])
    const body = JSON.stringify(list.json)
    for (const secret of [EDIT, VIEW, 'ann@example.com']) expect(body).not.toContain(secret)
    expect(list.json.docs[0]).not.toHaveProperty('authorEmail')
    expect(list.json.docs[0]).not.toHaveProperty('editToken')
    expect((await rest('GET', `/stories/${pendingId}`)).status).toBe(404)
  })

  it('moderation fields (reviewedAt, submittedByAdmin) are staff-only over REST', async () => {
    const anon = (await rest('GET', `/stories/${publishedId}`)).json
    expect(anon).not.toHaveProperty('reviewedAt')
    expect(anon).not.toHaveProperty('submittedByAdmin')
    expect(anon).toHaveProperty('publishedAt')
    const staff = (await rest('GET', `/stories/${publishedId}`, { token: editor })).json
    expect(staff).toHaveProperty('reviewedAt')
    expect(staff).toHaveProperty('submittedByAdmin')
  })

  it('anonymous cannot filter or sort on a token (field read access governs where/sort)', async () => {
    expect((await rest('GET', '/stories?where[editToken][like]=a')).status).toBe(400)
    expect((await rest('GET', '/stories?sort=editToken')).status).toBe(400)
    expect((await rest('GET', '/stories?where[authorEmail][like]=ann')).status).toBe(400)
  })

  it('pending story images are not listable anonymously', async () => {
    const res = await rest('GET', '/media?where[prefix][equals]=stories/pending')
    expect(res.json.totalDocs ?? 0).toBe(0)
    expect((await rest('GET', `/media/${pendingMediaId}`)).status).toBe(404)
  })

  it('an editor PATCHing slug, submittedByAdmin, publishedAt or tokens leaves the stored values unchanged', async () => {
    const before = await payload.findByID({ collection: 'stories', id: publishedId, depth: 0 })
    const res = await rest('PATCH', `/stories/${publishedId}`, {
      token: editor,
      body: { slug: 'hijacked', submittedByAdmin: true, publishedAt: '2000-01-01T00:00:00.000Z', reviewedAt: '2000-01-01T00:00:00.000Z', editToken: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    })
    expect(res.status).toBe(200)
    const after = await payload.findByID({ collection: 'stories', id: publishedId, depth: 0 })
    expect(after).toMatchObject({ slug: before.slug, submittedByAdmin: before.submittedByAdmin, publishedAt: before.publishedAt, reviewedAt: before.reviewedAt, editToken: EDIT, viewToken: VIEW })
  })

  it('a public token update (context.publicSubmission) carrying status: published and new tokens stays pending with its tokens', async () => {
    const doc = await payload.update({
      collection: 'stories',
      id: publishedId,
      data: { title: 'Edited by submitter', status: 'published', editToken: 'x'.repeat(36), viewToken: 'y'.repeat(36), slug: 'other', publishedAt: '2000-01-01T00:00:00.000Z' },
      overrideAccess: true,
      context: { ...ctx, publicSubmission: true },
    })
    expect(doc).toMatchObject({ title: 'Edited by submitter', status: 'pending', editToken: EDIT, viewToken: VIEW, slug: 'public-story' })
    expect(doc.publishedAt).not.toBe('2000-01-01T00:00:00.000Z')
  })

  it('the public stories upload route answers 503 without a Blob store', async () => {
    const { POST } = await import('@/app/api/public/stories/upload/route')
    const res = await POST(new Request('http://localhost:3000/api/public/stories/upload', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(503)
  })
})
