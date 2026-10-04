import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { findInvitee, consumeInvite, newInviteToken, hashInviteToken } from '@/lib/selector-invite'
import { clearCollection, destroyTestPayload, getTestPayload, rest } from './helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const PASS = 'a-long-pass-123'

/** The committee's selector endpoints (spec 3.4) and the atomic invite (spec 3.4 end). */
describe('selector endpoints and invites', () => {
  let payload: Payload
  let editor: string
  let admin: string
  let selector: string

  const login = async (email: string, password = PASS) => (await rest('POST', '/users/login', { body: { email, password } })).json?.token as string
  const post = (path: string, token: string | undefined, body: unknown) => rest('POST', `/selectors/${path}`, { token, body })
  const tokenOf = (url: string) => url.split('/selector/invite/')[1]

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    const ctx = { seedAdmin: true, disableRevalidate: true }
    await payload.create({ collection: 'users', data: { email: 'admin@example.com', password: PASS, role: 'admin' }, context: ctx })
    await payload.create({ collection: 'users', data: { email: 'editor@example.com', password: PASS, role: 'editor' }, context: ctx })
    await payload.create({ collection: 'users', data: { email: 'sel@example.com', password: PASS, role: 'selector' }, context: ctx })
    admin = await login('admin@example.com')
    editor = await login('editor@example.com')
    selector = await login('sel@example.com')
  })
  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('refuses anonymous and selector callers on every endpoint', async () => {
    for (const path of ['create', 'invite', 'unlink', 'disable', 'enable', 'set-password', 'remove']) {
      expect((await post(path, undefined, { id: 1 })).status, `${path} anonymous`).toBe(401)
      expect((await post(path, selector, { id: 1 })).status, `${path} selector`).toBe(403)
    }
  })

  it('an editor adds a selector and gets a one-time link; the row has only a hash', async () => {
    const res = await post('create', editor, { name: 'Sam Smith', email: 'Sam@Example.com' })
    expect(res.status).toBe(200)
    const token = tokenOf(res.json.inviteUrl)
    expect(token).toHaveLength(43)
    expect(res.json.inviteUrl.startsWith(payload.config.serverURL)).toBe(true)
    const row = await payload.db.findOne({ collection: 'users', where: { email: { equals: 'sam@example.com' } } })
    const r = row as { role: string; inviteTokenHash: string; inviteExpiresAt: string }
    expect(r.role).toBe('selector')
    expect(r.inviteTokenHash).toBe(hashInviteToken(token))
    expect(r.inviteTokenHash).not.toContain(token)
    const days = (new Date(r.inviteExpiresAt).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(13)
    expect(days).toBeLessThan(14.1)
    expect((await findInvitee(payload, token))?.email).toBe('sam@example.com')
  })

  it('validates name and email and refuses a duplicate email', async () => {
    expect((await post('create', editor, { name: '', email: 'x@example.com' })).status).toBe(400)
    expect((await post('create', editor, { name: 'X', email: 'nope' })).status).toBe(400)
    expect((await post('create', editor, { name: 'Dup', email: 'sam@example.com' })).status).toBe(400)
  })

  it('the invite is spent once: concurrent consumes, one wins; wrong and expired tokens give null', async () => {
    const res = await post('create', editor, { name: 'Race Runner', email: 'race@example.com' })
    const token = tokenOf(res.json.inviteUrl)
    const results = await Promise.all([consumeInvite(payload, token), consumeInvite(payload, token), consumeInvite(payload, token)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await consumeInvite(payload, token)).toBeNull()
    expect(await findInvitee(payload, token)).toBeNull()
    const row = (await payload.db.findOne({ collection: 'users', where: { email: { equals: 'race@example.com' } } })) as { inviteTokenHash: string | null; inviteExpiresAt: string | null }
    expect(row.inviteTokenHash ?? null).toBeNull()
    expect(row.inviteExpiresAt ?? null).toBeNull()
    expect(await consumeInvite(payload, newInviteToken())).toBeNull()
    expect(await consumeInvite(payload, 'short')).toBeNull()
    // expired
    const exp = await post('create', editor, { name: 'Late', email: 'late@example.com' })
    const t2 = tokenOf(exp.json.inviteUrl)
    await payload.update({ collection: 'users', where: { email: { equals: 'late@example.com' } }, data: {}, context: { disableRevalidate: true, selectorInvite: { hash: hashInviteToken(t2), expiresAt: new Date(Date.now() - 1000).toISOString(), invitedAt: new Date().toISOString() } } })
    expect(await consumeInvite(payload, t2)).toBeNull()
  })

  it('a new invite link replaces the old token and reopens the window', async () => {
    const created = await post('create', editor, { name: 'Re Invite', email: 'reinvite@example.com' })
    const first = tokenOf(created.json.inviteUrl)
    const id = created.json.id
    const again = await post('invite', editor, { id })
    expect(again.status).toBe(200)
    const second = tokenOf(again.json.inviteUrl)
    expect(second).not.toBe(first)
    expect(await findInvitee(payload, first)).toBeNull()
    expect((await findInvitee(payload, second))?.id).toBe(id)
  })

  it('disable ends sessions, enable restores sign-in, set-password works, remove deletes', async () => {
    const made = await post('create', editor, { name: 'Dee Able', email: 'dee@example.com' })
    const id = made.json.id
    expect((await post('set-password', editor, { id, password: 'short' })).status).toBe(400)
    expect((await post('set-password', editor, { id, password: 'chosen-by-committee-1' })).status).toBe(200)
    const token = await login('dee@example.com', 'chosen-by-committee-1')
    expect(token).toBeTruthy()
    expect((await post('disable', editor, { id })).status).toBe(200)
    expect((await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })).user).toBeNull()
    expect((await rest('POST', '/users/login', { body: { email: 'dee@example.com', password: 'chosen-by-committee-1' } })).status).toBe(401)
    expect((await post('enable', editor, { id })).status).toBe(200)
    expect(await login('dee@example.com', 'chosen-by-committee-1')).toBeTruthy()
    expect((await post('remove', editor, { id })).status).toBe(200)
    expect(await payload.count({ collection: 'users', where: { id: { equals: id } } })).toEqual({ totalDocs: 0 })
  })

  it('an editor cannot aim the endpoints at an admin or an editor (404), an admin can only reach selectors too', async () => {
    const adminRow = await payload.find({ collection: 'users', where: { email: { equals: 'admin@example.com' } }, limit: 1 })
    const editorRow = await payload.find({ collection: 'users', where: { email: { equals: 'editor@example.com' } }, limit: 1 })
    for (const target of [adminRow.docs[0].id, editorRow.docs[0].id]) {
      for (const path of ['invite', 'unlink', 'disable', 'enable', 'set-password', 'remove']) {
        expect((await post(path, editor, { id: target, password: 'something-long-1' })).status, `editor ${path}`).toBe(404)
        expect((await post(path, admin, { id: target, password: 'something-long-1' })).status, `admin ${path}`).toBe(404)
      }
    }
    expect((await payload.findByID({ collection: 'users', id: adminRow.docs[0].id })).disabled).toBeFalsy()
  })

  it('unlink clears a Facebook link', async () => {
    const made = await post('create', admin, { name: 'Fay Book', email: 'fay@example.com' })
    const id = made.json.id
    await payload.update({ collection: 'users', id, data: { facebookId: 'fb-fay' }, context: { disableRevalidate: true, facebookBind: true } })
    expect((await post('unlink', editor, { id })).status).toBe(200)
    const row = (await payload.db.findOne({ collection: 'users', where: { id: { equals: id } } })) as { facebookId?: string | null }
    expect(row.facebookId ?? null).toBeNull()
  })

  it('the Users admin list shows editors only selectors and themselves (no admins)', async () => {
    const list = await rest('GET', '/users?limit=100', { token: editor })
    expect(list.json.docs.some((d: { role: string }) => d.role === 'admin')).toBe(false)
  })
})
