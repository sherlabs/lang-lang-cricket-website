import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

/**
 * The simple-admin work hides things in the UI only. These pin the access rules, so a
 * hidden menu entry can never be mistaken for (or replace) real access control.
 */
describe('admin simplification leaves access rules unchanged', () => {
  let payload: Payload
  let editor: string
  let admin: string

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    await clearCollection(payload, 'announcements')
    await clearCollection(payload, 'sponsors')
    admin = await tokenFor(payload, 'admin')
    editor = await tokenFor(payload, 'editor')
    await payload.create({ collection: 'announcements', data: { title: 'Live', published: true }, context: { disableRevalidate: true } })
    await payload.create({ collection: 'announcements', data: { title: 'Draft', published: false }, context: { disableRevalidate: true } })
  })

  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('anonymous: public collections stay readable, unpublished stay hidden, writes refused', async () => {
    const list = await rest('GET', '/announcements')
    expect(list.status).toBe(200)
    expect(list.json.docs.map((d: { title: string }) => d.title)).toEqual(['Live'])
    expect((await rest('GET', '/sponsors')).status).toBe(200)
    expect((await rest('POST', '/announcements', { body: { title: 'x' } })).status).toBeGreaterThanOrEqual(401)
    expect((await rest('POST', '/sponsors', { body: { name: 'x' } })).status).toBeGreaterThanOrEqual(401)
    expect((await rest('GET', '/event-rsvps')).status).toBeGreaterThanOrEqual(401)
    expect((await rest('GET', '/users')).status).toBeGreaterThanOrEqual(401)
    expect((await rest('GET', '/player-sync-runs')).status).toBeGreaterThanOrEqual(401)
  })

  it('editor: can do the committee jobs', async () => {
    const created = await rest('POST', '/sponsors', { token: editor, body: { name: 'Corner Cafe', tier: 'Gold' } })
    expect(created.status).toBe(201)
    const ann = await rest('POST', '/announcements', { token: editor, body: { title: 'Hello', published: true } })
    expect(ann.status).toBe(201)
    expect((await rest('GET', '/announcements', { token: editor })).json.docs.length).toBe(3)
    expect((await rest('GET', '/event-rsvps', { token: editor })).status).toBe(200)
  })

  it('editor: still cannot do what the access rules forbid (even though the UI hides it)', async () => {
    const users = await rest('GET', '/users', { token: editor })
    expect(users.json.docs.map((u: { role: string }) => u.role)).toEqual(['editor'])
    expect((await rest('POST', '/users', { token: editor, body: { email: 'new@example.com', password: 'pw-12345678', role: 'editor' } })).status).toBe(403)
    expect((await rest('POST', '/player-aliases', { token: editor, body: { nameKey: 'a|b', player: 1 } })).status).toBeGreaterThanOrEqual(400)
    expect((await rest('POST', '/player-sync-runs', { token: editor, body: { startedAt: new Date().toISOString() } })).status).toBeGreaterThanOrEqual(400)
    expect((await rest('POST', '/player-seasons', { token: editor, body: {} })).status).toBeGreaterThanOrEqual(400)
    const club = await rest('POST', '/globals/club', { token: editor, body: { name: 'Hijacked' } })
    expect(club.status).toBe(403)
  })

  it('admin: keeps full access to the hidden areas', async () => {
    expect((await rest('GET', '/users', { token: admin })).json.docs.length).toBeGreaterThanOrEqual(2)
    expect((await rest('POST', '/globals/club', { token: admin, body: { name: 'Lang Lang Cricket Club' } })).status).toBe(200)
    expect((await rest('GET', '/player-sync-runs', { token: admin })).status).toBe(200)
  })
})
