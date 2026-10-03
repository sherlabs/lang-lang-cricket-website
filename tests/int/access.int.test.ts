import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest } from './helpers'

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

  it('anonymous REST cannot list users', async () => {
    const res = await rest('GET', '/users')
    expect(res.status).toBe(403)
  })
})
