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
