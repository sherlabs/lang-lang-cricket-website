import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

// Spec §15: contacts-admin-actions → people.int (trim, section default).
describe('people', () => {
  let payload: Payload
  let editor: string

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'people')
    editor = await tokenFor(payload, 'editor')
  })

  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('trims strings and defaults the section to committee', async () => {
    const res = await rest('POST', '/people', {
      token: editor,
      body: { name: '  Sam Patel ', role: ' Treasurer ', phone: ' 0400 000 003 ', email: ' sam@example.com ' },
    })
    expect(res.status).toBe(201)
    expect(res.json.doc).toMatchObject({ name: 'Sam Patel', role: 'Treasurer', phone: '0400 000 003', email: 'sam@example.com', section: 'committee', sortOrder: 0 })
    const patched = await rest('PATCH', `/people/${res.json.doc.id}`, { token: editor, body: { name: ' Samuel Patel  ' } })
    expect(patched.json.doc.name).toBe('Samuel Patel')
  })

  it('requires name and role, and validates email (empty is fine)', async () => {
    expect((await rest('POST', '/people', { token: editor, body: { role: 'Coach' } })).status).toBe(400)
    expect((await rest('POST', '/people', { token: editor, body: { name: 'A', role: 'Coach', email: 'not-an-email' } })).status).toBe(400)
    expect((await rest('POST', '/people', { token: editor, body: { name: 'A', role: 'Coach', email: '' } })).status).toBe(201)
  })

  it('rejects an unknown section', async () => {
    expect((await rest('POST', '/people', { token: editor, body: { name: 'B', role: 'Coach', section: 'board' } })).status).toBe(400)
  })

  it('the ETL context imports values verbatim (no trim, no email validation)', async () => {
    const doc = await payload.create({
      collection: 'people',
      data: { name: '  Legacy Name ', role: 'President', email: 'legacy-not-an-email', section: 'leadership' },
      context: { etl: true, disableRevalidate: true },
    })
    expect(doc.name).toBe('  Legacy Name ')
    expect(doc.email).toBe('legacy-not-an-email')
  })

  it('listPeople groups as the public pages expect', async () => {
    const { listPeople } = await import('@/lib/content-queries')
    const leadership = await listPeople('leadership')
    expect(leadership.map((p) => p.name)).toEqual(['  Legacy Name '])
    expect(leadership[0].photoUrl).toBe('')
  })

  it('anonymous users can read but not write', async () => {
    expect((await rest('GET', '/people')).status).toBe(200)
    expect((await rest('POST', '/people', { body: { name: 'X', role: 'Y' } })).status).toBe(403)
  })
})
