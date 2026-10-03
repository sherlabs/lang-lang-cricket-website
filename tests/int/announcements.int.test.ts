import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

// Spec §15: announcements-queries + announcements-admin-actions → announcements.int.
describe('announcements', () => {
  let payload: Payload
  let editor: string
  const ctx = { disableRevalidate: true }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'announcements')
    editor = await tokenFor(payload, 'editor')
    const make = (title: string, published: boolean) => payload.create({ collection: 'announcements', data: { title, body: `${title} body`, published }, context: ctx })
    await make('First', true)
    await make('Hidden draft', false)
    await make('Second', true)
  })

  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('public queries return published announcements only, newest first', async () => {
    const { getLatestAnnouncement, listPublishedAnnouncements } = await import('@/lib/announcements-queries')
    expect((await listPublishedAnnouncements()).map((a) => a.title)).toEqual(['Second', 'First'])
    const latest = await getLatestAnnouncement()
    expect(latest?.title).toBe('Second')
    expect(latest?.createdAt).toBeInstanceOf(Date)
  })

  it('anonymous REST sees published rows only, and cannot write', async () => {
    const list = await rest('GET', '/announcements?limit=10')
    expect(list.status).toBe(200)
    expect(list.json.docs.map((d: { title: string }) => d.title).sort()).toEqual(['First', 'Second'])
    expect((await rest('POST', '/announcements', { body: { title: 'x' } })).status).toBe(403)
    const id = list.json.docs[0].id
    expect((await rest('PATCH', `/announcements/${id}`, { body: { title: 'y' } })).status).toBe(403)
    expect((await rest('DELETE', `/announcements/${id}`)).status).toBe(403)
  })

  it('staff can create (title required, body optional), publish, edit and delete', async () => {
    const missing = await rest('POST', '/announcements', { token: editor, body: { body: 'no title' } })
    expect(missing.status).toBe(400)
    const created = await rest('POST', '/announcements', { token: editor, body: { title: 'Working bee' } })
    expect(created.status).toBe(201)
    expect(created.json.doc).toMatchObject({ title: 'Working bee', body: '', published: false })
    const id = created.json.doc.id
    const patched = await rest('PATCH', `/announcements/${id}`, { token: editor, body: { published: true, body: 'Saturday 9am' } })
    expect(patched.status).toBe(200)
    expect(patched.json.doc).toMatchObject({ published: true, body: 'Saturday 9am' })
    const { getLatestAnnouncement } = await import('@/lib/announcements-queries')
    expect((await getLatestAnnouncement())?.id).toBe(id)
    expect((await rest('DELETE', `/announcements/${id}`, { token: editor })).status).toBe(200)
    expect((await getLatestAnnouncement())?.title).toBe('Second')
  })

  it('staff REST sees unpublished rows too', async () => {
    const list = await rest('GET', '/announcements?limit=10', { token: editor })
    expect(list.json.docs.map((d: { title: string }) => d.title)).toContain('Hidden draft')
  })
})
