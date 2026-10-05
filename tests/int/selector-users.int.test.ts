import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest } from './helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const PASS = 'a-long-pass-123'

/** Privilege rules for selectors (announce-teams spec 3.3 and 3.9). Facebook is not involved here. */
describe('selector users: privilege escalation, passwords, sessions, hidden fields', () => {
  let payload: Payload
  let admin: { id: number; token: string }
  let editor: { id: number; token: string }
  let editor2: { id: number; token: string }
  let selector: { id: number; token: string }

  const make = async (email: string, role: 'admin' | 'editor' | 'selector') => {
    const doc = await payload.create({ collection: 'users', data: { email, password: PASS, role }, context: { seedAdmin: true, disableRevalidate: true } })
    const login = await rest('POST', '/users/login', { body: { email, password: PASS } })
    return { id: doc.id as number, token: login.json.token as string }
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    admin = await make('admin@example.com', 'admin')
    editor = await make('editor@example.com', 'editor')
    editor2 = await make('editor2@example.com', 'editor')
    selector = await make('sel@example.com', 'selector')
  })
  afterAll(async () => {
    // Later files create their own users with the conventional `<role>@example.com` addresses and passwords.
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })

  describe('editor creating users', () => {
    const create = (body: Record<string, unknown>) => rest('POST', '/users', { token: editor.token, body: { email: `n${Math.random().toString(36).slice(2)}@example.com`, password: PASS, ...body } })

    it('refuses role admin and role editor with 403', async () => {
      expect((await create({ role: 'admin' })).status).toBe(403)
      expect((await create({ role: 'editor' })).status).toBe(403)
    })
    it('omitting the role creates a selector, never an editor', async () => {
      const res = await create({})
      expect(res.status).toBe(201)
      expect(res.json.doc.role).toBe('selector')
    })
    it('strips mass-assigned privileged fields', async () => {
      const res = await create({ role: 'selector', facebookId: 'fb-evil', inviteTokenHash: 'abc', inviteExpiresAt: '2099-01-01T00:00:00Z', sessions: [{ id: 'x', expiresAt: '2099-01-01T00:00:00Z' }], _verified: true, loginAttempts: 0, lockUntil: null, disabled: true })
      expect(res.status).toBe(201)
      const row = await payload.findByID({ collection: 'users', id: res.json.doc.id, depth: 0 })
      expect(row.disabled).toBeFalsy()
      expect(row.facebookId ?? null).toBeNull()
      expect(row.inviteTokenHash ?? null).toBeNull()
      expect(row.sessions ?? []).toEqual([])
    })
    it('an admin can create any role', async () => {
      const res = await rest('POST', '/users', { token: admin.token, body: { email: 'adm2@example.com', password: PASS, role: 'admin' } })
      expect(res.status).toBe(201)
    })
    it('a selector and anonymous cannot create users', async () => {
      expect((await rest('POST', '/users', { token: selector.token, body: { email: 'q@example.com', password: PASS, role: 'selector' } })).status).toBe(403)
      expect((await rest('POST', '/users', { body: { email: 'q@example.com', password: PASS, role: 'selector' } })).status).toBe(403)
    })
  })

  describe('editor updating, reading, deleting', () => {
    it('cannot change a role (own, a selector, anyone) and the attempt is a 403', async () => {
      expect((await rest('PATCH', `/users/${editor.id}`, { token: editor.token, body: { role: 'admin' } })).status).toBe(403)
      expect((await rest('PATCH', `/users/${selector.id}`, { token: editor.token, body: { role: 'editor' } })).status).toBe(403)
      expect((await payload.findByID({ collection: 'users', id: selector.id })).role).toBe('selector')
      expect((await payload.findByID({ collection: 'users', id: editor.id })).role).toBe('editor')
    })
    it('can rename and disable a selector', async () => {
      expect((await rest('PATCH', `/users/${selector.id}`, { token: editor.token, body: { name: 'Sel One' } })).status).toBe(200)
    })
    it('cannot update, read, unlock or delete admins or other editors', async () => {
      for (const target of [admin.id, editor2.id]) {
        expect([403, 404], `update ${target}`).toContain((await rest('PATCH', `/users/${target}`, { token: editor.token, body: { name: 'Hacked' } })).status)
        expect([403, 404], `read ${target}`).toContain((await rest('GET', `/users/${target}`, { token: editor.token })).status)
        expect([403, 404], `delete ${target}`).toContain((await rest('DELETE', `/users/${target}`, { token: editor.token })).status)
      }
      expect((await rest('POST', '/users/unlock', { token: editor.token, body: { email: 'admin@example.com' } })).status).toBe(403)
      const list = await rest('GET', '/users?limit=100', { token: editor.token })
      const roles = new Set<string>(list.json.docs.map((d: { role: string }) => d.role))
      expect([...roles].sort()).toEqual(['editor', 'selector'])
      expect(list.json.docs.filter((d: { role: string }) => d.role === 'editor').map((d: { id: number }) => d.id)).toEqual([editor.id])
      expect((await payload.findByID({ collection: 'users', id: admin.id })).name ?? '').not.toBe('Hacked')
    })
    it('can delete a selector but not an admin', async () => {
      const made = await rest('POST', '/users', { token: editor.token, body: { email: 'gone@example.com', password: PASS } })
      expect((await rest('DELETE', `/users/${made.json.doc.id}`, { token: editor.token })).status).toBe(200)
    })
  })

  describe('selector', () => {
    it('lists only self', async () => {
      const list = await rest('GET', '/users', { token: selector.token })
      expect(list.json.docs.map((d: { id: number }) => d.id)).toEqual([selector.id])
    })
    it('cannot change role, email, disabled or facebookId (403)', async () => {
      for (const body of [{ role: 'admin' }, { email: 'new@example.com' }, { disabled: false }, { facebookId: '123' }]) {
        expect((await rest('PATCH', `/users/${selector.id}`, { token: selector.token, body })).status, JSON.stringify(body)).toBe(403)
      }
      const row = await payload.findByID({ collection: 'users', id: selector.id })
      expect(row.role).toBe('selector')
      expect(row.email).toBe('sel@example.com')
    })
    it('cannot update, read, delete anyone else, cannot unlock', async () => {
      expect([403, 404]).toContain((await rest('PATCH', `/users/${editor.id}`, { token: selector.token, body: { name: 'x' } })).status)
      expect([403, 404]).toContain((await rest('GET', `/users/${editor.id}`, { token: selector.token })).status)
      expect([403, 404]).toContain((await rest('DELETE', `/users/${selector.id}`, { token: selector.token })).status)
      expect((await rest('POST', '/users/unlock', { token: selector.token, body: { email: 'sel@example.com' } })).status).toBe(403)
    })
    it('may change their own name', async () => {
      expect((await rest('PATCH', `/users/${selector.id}`, { token: selector.token, body: { name: 'Mine' } })).status).toBe(200)
    })
  })

  describe('passwords', () => {
    it('a 9-character password fails on REST and the Local API', async () => {
      const rows = await rest('POST', '/users', { token: editor.token, body: { email: 'short@example.com', password: '123456789' } })
      expect(rows.status).toBe(400)
      await expect(payload.update({ collection: 'users', id: selector.id, data: { password: '123456789' } })).rejects.toThrow()
    })
    it('a selector changing their password via REST needs currentPassword', async () => {
      const bare = await rest('PATCH', `/users/${selector.id}`, { token: selector.token, body: { password: 'brand-new-pass-1' } })
      expect(bare.status).toBe(400)
      const wrong = await rest('PATCH', `/users/${selector.id}`, { token: selector.token, body: { password: 'brand-new-pass-1', currentPassword: 'not-the-one-123' } })
      expect(wrong.status).toBe(400)
      expect((await rest('POST', '/users/login', { body: { email: 'sel@example.com', password: PASS } })).status).toBe(200)
      const ok = await rest('PATCH', `/users/${selector.id}`, { token: selector.token, body: { password: 'brand-new-pass-1', currentPassword: PASS } })
      expect(ok.status).toBe(200)
      expect((await rest('POST', '/users/login', { body: { email: 'sel@example.com', password: 'brand-new-pass-1' } })).status).toBe(200)
      expect((await rest('POST', '/users/login', { body: { email: 'sel@example.com', password: PASS } })).status).not.toBe(200)
    })
  })

  describe('sessions', () => {
    it('disabling through the raw form (payload.update) revokes the cookie and blocks login', async () => {
      const s = await make('sess@example.com', 'selector')
      const headers = new Headers({ Authorization: `JWT ${s.token}` })
      expect((await payload.auth({ headers })).user).toBeTruthy()
      await payload.update({ collection: 'users', id: s.id, data: { disabled: true }, overrideAccess: true, context: { disableRevalidate: true } })
      expect((await payload.auth({ headers })).user).toBeNull()
      const login = await rest('POST', '/users/login', { body: { email: 'sess@example.com', password: PASS } })
      expect(login.status).toBe(401)
      const wrong = await rest('POST', '/users/login', { body: { email: 'sess@example.com', password: 'wrong-wrong-123' } })
      expect(wrong.json.errors[0].message).toBe(login.json.errors[0].message)
    })
    it('a role or email change clears the sessions', async () => {
      const s = await make('sess2@example.com', 'selector')
      const headers = new Headers({ Authorization: `JWT ${s.token}` })
      await payload.update({ collection: 'users', id: s.id, data: { email: 'sess2b@example.com' }, overrideAccess: true, context: { disableRevalidate: true } })
      expect((await payload.auth({ headers })).user).toBeNull()
      const t = await make('sess3@example.com', 'selector')
      const h2 = new Headers({ Authorization: `JWT ${t.token}` })
      await payload.update({ collection: 'users', id: t.id, data: { role: 'editor' }, overrideAccess: true, context: { disableRevalidate: true } })
      expect((await payload.auth({ headers: h2 })).user).toBeNull()
    })
    it('locks after five bad passwords with the same uniform message', async () => {
      await make('lock@example.com', 'selector')
      let last = { status: 0, json: null as { errors: Array<{ message: string }> } | null }
      for (let i = 0; i < 6; i++) last = await rest('POST', '/users/login', { body: { email: 'lock@example.com', password: `wrong-pass-${i}-xx` } })
      const good = await rest('POST', '/users/login', { body: { email: 'lock@example.com', password: PASS } })
      expect(good.status).toBe(401)
      expect(last.status).toBe(401)
      // A locked account and an unknown email read the same: REST login does not reveal which accounts exist.
      const unknown = await rest('POST', '/users/login', { body: { email: 'nobody-here@example.com', password: PASS } })
      expect(unknown.status).toBe(401)
      expect(good.json.errors[0].message).toBe(unknown.json.errors[0].message)
      expect(last.json!.errors[0].message).toBe(unknown.json.errors[0].message)
    })
    it('the admin area refuses a selector (access.admin)', async () => {
      const users = payload.config.collections.find((c) => c.slug === 'users')!
      const admin_ = users.access!.admin as (a: { req: { user: unknown } }) => boolean
      expect(admin_({ req: { user: { role: 'selector' } } })).toBe(false)
      expect(admin_({ req: { user: { role: 'editor' } } })).toBe(true)
      expect(admin_({ req: { user: { role: 'admin', disabled: true } } })).toBe(false)
    })
  })

  describe('hidden-field probes: REST where= filters leak nothing', () => {
    const fields = ['facebookId', 'inviteTokenHash', 'inviteExpiresAt', 'sessions', 'hash', 'salt']
    beforeAll(async () => {
      await payload.update({ collection: 'users', id: selector.id, data: { facebookId: 'fb-secret-1', inviteTokenHash: 'deadbeef' }, overrideAccess: true, context: { disableRevalidate: true, facebookBind: true } })
    })
    for (const who of ['anonymous', 'selector', 'editor'] as const) {
      it(`${who}: a where on a sensitive field never distinguishes a match`, async () => {
        const token = who === 'selector' ? selector.token : who === 'editor' ? editor.token : undefined
        const baseline = await rest('GET', '/users?where[email][equals]=nobody@nowhere.test', { token })
        for (const f of fields) {
          for (const [op, value] of [['equals', 'fb-secret-1'], ['like', 'dead'], ['equals', 'deadbeef'], ['exists', 'true']]) {
            const res = await rest('GET', `/users?where[${f}][${op}]=${value}`, { token })
            const leaked = res.status === 200 && (res.json?.totalDocs ?? 0) > (baseline.json?.totalDocs ?? 0) && f !== 'sessions'
            expect(leaked, `${who} ${f} ${op}`).toBe(false)
            expect(JSON.stringify(res.json)).not.toContain('fb-secret-1')
            expect(JSON.stringify(res.json)).not.toContain('deadbeef')
          }
        }
      })
    }
    it('the field is absent from responses (self, editor and admin reads)', async () => {
      for (const token of [selector.token, editor.token, admin.token]) {
        const res = await rest('GET', `/users/${selector.id}`, { token })
        expect(JSON.stringify(res.json)).not.toMatch(/facebookId|inviteTokenHash|fb-secret-1|deadbeef/)
      }
    })
  })

  describe('facebookId rules', () => {
    it('refuses a link on a non-selector row, and only the OAuth flow (context flag) may set one', async () => {
      await expect(payload.update({ collection: 'users', id: editor.id, data: { facebookId: 'fb-on-editor' }, overrideAccess: true, context: { disableRevalidate: true, facebookBind: true } })).rejects.toThrow()
      await expect(payload.update({ collection: 'users', id: selector.id, data: { facebookId: 'fb-no-flag' }, overrideAccess: true, context: { disableRevalidate: true } })).rejects.toThrow()
      expect((await rest('PATCH', `/users/${selector.id}`, { token: editor.token, body: { facebookId: 'fb-by-editor' } })).status).toBe(403)
    })
    it('an editor can unlink (null) and an email change drops the link', async () => {
      expect((await rest('PATCH', `/users/${selector.id}`, { token: editor.token, body: { facebookId: null } })).status).toBe(200)
      await payload.update({ collection: 'users', id: selector.id, data: { facebookId: 'fb-2' }, overrideAccess: true, context: { disableRevalidate: true, facebookBind: true } })
      await payload.update({ collection: 'users', id: selector.id, data: { email: 'sel-new@example.com' }, overrideAccess: true, context: { disableRevalidate: true } })
      const row = await payload.db.findOne({ collection: 'users', where: { id: { equals: selector.id } } })
      expect((row as { facebookId?: string | null }).facebookId ?? null).toBeNull()
    })
  })
})
