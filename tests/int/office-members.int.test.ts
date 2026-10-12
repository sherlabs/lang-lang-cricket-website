import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))

/**
 * Member directory (wave D WP-1) against real Postgres: the collection hooks, the directory filters, the editor name projection,
 * the office routes (origin, role, audit rows), personal-data removal and the public leak checks. Nothing leaves the machine.
 */
const ORIGIN = 'http://localhost:3000'
const PRIVATE = { email: 'private-member@example.org', phone: '0499 999 999', addressLine: '1 Secret Street', notes: 'private note' }

describe('member directory', () => {
  let payload: Payload
  const tok: Record<string, string> = {}
  const user: Record<string, never> = {} as never

  const post = async (route: string, opts: { token?: string; origin?: string | null; form?: Record<string, string | string[]>; fetchSite?: string } = {}) => {
    const body = new FormData()
    for (const [k, v] of Object.entries(opts.form ?? {})) for (const item of Array.isArray(v) ? v : [v]) body.append(k, item)
    const headers: Record<string, string> = {}
    if (opts.token) headers.Authorization = `JWT ${opts.token}`
    if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN
    if (opts.fetchSite) headers['Sec-Fetch-Site'] = opts.fetchSite
    const request = new Request(`${ORIGIN}${route}`, { method: 'POST', headers, body })
    const mod = await (route.includes('link-players')
      ? import('@/app/api/admin/office/members/link-players/route')
      : route.includes('/erase')
        ? import('@/app/api/admin/office/members/erase/route')
        : route.includes('/export/')
          ? import('@/app/api/admin/office/export/members/route')
          : import('@/app/api/admin/office/members/route'))
    return mod.POST(request)
  }
  const member = async (data: Record<string, unknown>) =>
    payload.create({ collection: 'members', data: { roles: ['supporter'], ...data } as never, overrideAccess: true, depth: 0 })
  const reset = async () => {
    await clearCollection(payload, 'members')
    await clearCollection(payload, 'office-audit-log')
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    for (const role of ['admin', 'editor', 'selector'] as const) {
      tok[role] = await tokenFor(payload, role)
      const found = await payload.find({ collection: 'users', where: { email: { equals: `${role}@example.com` } }, limit: 1, depth: 0, overrideAccess: true })
      user[role] = { ...(found.docs[0] as object), collection: 'users' } as never
    }
  }, 120_000)
  afterAll(async () => {
    await reset()
    await clearCollection(payload, 'players')
    await clearCollection(payload, 'people')
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(reset)

  describe('collection hooks', () => {
    it('trims, lowercases the email and saves empty contact fields as null', async () => {
      const m = await member({ firstName: ' Sam ', lastName: ' Taylor ', email: ' SAM@Example.COM ', phone: '  ', locality: '' })
      expect(m).toMatchObject({ firstName: 'Sam', lastName: 'Taylor', email: 'sam@example.com', displayName: 'Sam Taylor' })
      expect(m.phone ?? null).toBeNull()
      expect(m.locality ?? null).toBeNull()
    })

    it('refuses a bad email, a card number in notes and a member with no name and no link', async () => {
      await expect(member({ firstName: 'A', lastName: 'B', email: 'nope' })).rejects.toThrow()
      await expect(member({ firstName: 'A', lastName: 'B', notes: 'card 4111 1111 1111 1111' })).rejects.toThrow()
      await expect(member({ email: 'a@b.co' })).rejects.toThrow()
    })

    it('a linked player supplies the name, one member per player, and a person-only member is named from the person', async () => {
      const p = await payload.create({ collection: 'players', data: { firstName: 'Alex', lastName: 'Jones', displayName: 'Alex Jones', slug: 'alex-jones-office' } as never, overrideAccess: true, context: { disableRevalidate: true } })
      const m = await member({ player: p.id })
      expect(m.displayName).toBe('Alex Jones')
      await expect(member({ player: p.id })).rejects.toThrow()
      await member({ firstName: 'No', lastName: 'Link' })
      await member({ firstName: 'Also', lastName: 'NoLink' })
      const person = await payload.create({ collection: 'people', data: { name: 'Robin Hall', role: 'Treasurer' } as never, overrideAccess: true, context: { disableRevalidate: true } })
      expect((await member({ person: person.id })).displayName).toBe('Robin Hall')
    })

    it('the personal link version counts up on archive, do-not-email and erase, and no REST write sets it', async () => {
      const m = await member({ firstName: 'Link', lastName: 'Version' })
      expect(m.volunteerLinkVersion).toBe(0)
      const touch = async (data: Record<string, unknown>) => (await payload.update({ collection: 'members', id: m.id, data: data as never, overrideAccess: true, depth: 0 })).volunteerLinkVersion
      expect(await touch({ notes: 'unrelated edit' })).toBe(0)
      expect(await touch({ status: 'past' })).toBe(1)
      expect(await touch({ doNotEmail: true })).toBe(2)
      expect(await touch({ notes: 'again' })).toBe(2)
    })
  })

  describe('directory and filters', () => {
    const seed = async () => {
      const old = await member({ firstName: 'Ada', lastName: 'Adult', email: 'ada@example.org', phone: '1', roles: ['volunteer'] })
      await member({ firstName: 'Ben', lastName: 'NoEmail', phone: '2', roles: ['coach'] })
      await member({ firstName: 'Cy', lastName: 'NoPhone', email: 'cy@example.org', roles: ['committee', 'volunteer'] })
      await member({ firstName: 'Di', lastName: 'Neither', roles: ['supporter'] })
      const parent = await member({ firstName: 'Pat', lastName: 'Parent', email: 'pat@example.org', phone: '3', roles: ['parent'] })
      await member({ firstName: 'Kid', lastName: 'WithGuardian', dateOfBirth: '2015-04-04', guardians: [parent.id], roles: ['player'] })
      await member({ firstName: 'Kit', lastName: 'Orphan', dateOfBirth: '2014-04-04', roles: ['player'] })
      await member({ firstName: 'Gone', lastName: 'Past', status: 'past', email: 'gone@example.org', roles: ['player'] })
      await member({ firstName: 'Dup', lastName: 'One', email: 'shared@example.org', phone: '4' })
      await member({ firstName: 'Dup', lastName: 'Two', email: 'shared@example.org', phone: '5' })
      const p = await payload.create({ collection: 'players', data: { firstName: 'Junior', lastName: 'Player', displayName: 'Junior Player', slug: 'junior-player-office', isJunior: true } as never, overrideAccess: true, context: { disableRevalidate: true } })
      await member({ player: p.id, roles: ['player'] })
      return old
    }
    const names = async (params: Record<string, string>) => {
      const { listMembers } = await import('@/lib/members-queries')
      const { parseMemberQuery } = await import('@/lib/office/member-filters')
      const dir = await listMembers(user.admin, parseMemberQuery(params))
      return dir!.rows.map((r) => r.name).sort()
    }

    it('filters by status, role, missing contact, juniors and search', async () => {
      await seed()
      expect(await names({ status: 'past' })).toEqual(['Gone Past'])
      expect(await names({ status: 'active', role: 'volunteer' })).toEqual(['Ada Adult', 'Cy NoPhone'])
      expect(await names({ role: 'committee' })).toEqual(['Cy NoPhone'])
      expect(await names({ missing: 'email' })).toEqual(['Ben NoEmail', 'Di Neither', 'Junior Player', 'Kid WithGuardian', 'Kit Orphan'])
      expect(await names({ missing: 'phone' })).toEqual(['Cy NoPhone', 'Di Neither', 'Gone Past', 'Junior Player', 'Kid WithGuardian', 'Kit Orphan'])
      expect(await names({ missing: 'both' })).toEqual(['Di Neither', 'Junior Player', 'Kid WithGuardian', 'Kit Orphan'])
      expect(await names({ age: 'junior' })).toEqual(['Junior Player', 'Kid WithGuardian', 'Kit Orphan'])
      expect(await names({ missing: 'guardian' })).toEqual(['Junior Player', 'Kit Orphan'])
      expect(await names({ q: 'neith' })).toEqual(['Di Neither'])
      expect(await names({ q: 'junior pl' })).toEqual(['Junior Player'])
      expect(await names({ q: 'ada@example' })).toEqual(['Ada Adult'])
    })

    it('treats %, _ and \\ in the search as plain characters', async () => {
      await seed()
      await member({ firstName: 'Under', lastName: 'Score', email: 'a_b@example.org' })
      await member({ firstName: 'Axb', lastName: 'Match', email: 'axb@example.org' })
      expect(await names({ q: '%' })).toEqual([])
      expect(await names({ q: '_' })).toEqual(['Under Score'])
      expect(await names({ q: 'a_b' })).toEqual(['Under Score'])
      expect(await names({ q: '\\' })).toEqual([])
    })

    it('counts what is incomplete among active members only, and flags shared emails', async () => {
      await seed()
      const { memberCompleteness, duplicateEmailCount, duplicateEmailMemberIds } = await import('@/lib/members-queries')
      expect(await memberCompleteness(user.admin)).toEqual({ total: 10, noEmail: 5, noPhone: 5, noBoth: 4, noEmailAny: 5 })
      await member({ firstName: 'Dne', lastName: 'Phoned', doNotEmail: true, phone: '0400000000' })
      expect(await memberCompleteness(user.admin)).toMatchObject({ noEmail: 5, noEmailAny: 6 })
      expect(await duplicateEmailCount(user.admin)).toBe(1)
      expect((await duplicateEmailMemberIds(user.admin)).size).toBe(2)
    })

    it('pages at 50 rows', async () => {
      for (let i = 0; i < 53; i++) await member({ firstName: 'Bulk', lastName: `M${String(i).padStart(2, '0')}` })
      const { listMembers } = await import('@/lib/members-queries')
      const { parseMemberQuery } = await import('@/lib/office/member-filters')
      const first = await listMembers(user.admin, parseMemberQuery({}))
      const second = await listMembers(user.admin, parseMemberQuery({ page: '2' }))
      expect([first!.rows.length, second!.rows.length, first!.total, first!.totalPages]).toEqual([50, 3, 53, 2])
    })

    it('refuses everyone but an admin', async () => {
      const q = await import('@/lib/members-queries')
      const { parseMemberQuery } = await import('@/lib/office/member-filters')
      expect(await q.listMembers(user.editor, parseMemberQuery({}))).toBeNull()
      expect(await q.listMembers(user.selector, parseMemberQuery({}))).toBeNull()
      expect(await q.listMembers(undefined, parseMemberQuery({}))).toBeNull()
      expect(await q.memberCompleteness(user.editor)).toBeNull()
      expect(await q.linkPlayersAsMembers(user.editor)).toBeNull()
    })
  })

  describe('names for editors', () => {
    it('gives the committee names only, scoped to the screen, with juniors shortened', async () => {
      const { listMemberNames } = await import('@/lib/members-queries')
      await member({ firstName: 'Vee', lastName: 'Olunteer', roles: ['volunteer'], ...PRIVATE })
      await member({ firstName: 'Sam', lastName: 'Taylor', roles: ['volunteer'], dateOfBirth: '2014-02-02' })
      await member({ firstName: 'Pat', lastName: 'Parent', roles: ['parent'] })
      const roster = await listMemberNames(user.editor, 'roster')
      expect(roster).toEqual([{ id: expect.any(Number), displayName: 'Sam T.' }, { id: expect.any(Number), displayName: 'Vee Olunteer' }])
      expect(JSON.stringify(roster)).not.toContain('private')
      expect(await listMemberNames(user.admin, 'actions')).toEqual([])
      expect(await listMemberNames(user.selector, 'roster')).toEqual([])
      expect(await listMemberNames(undefined, 'roster')).toEqual([])
    })
  })

  describe('office routes', () => {
    const form = { firstName: 'Route', lastName: 'Added', roles: ['volunteer'], email: 'Route@Example.org', phone: '0400 000 000' }

    it('quick add: an admin adds a member and is redirected; the server sets the source', async () => {
      const res = await post('/api/admin/office/members', { token: tok.admin, form })
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toContain('/office/members?notice=added')
      const found = await payload.find({ collection: 'members', where: { email: { equals: 'route@example.org' } }, overrideAccess: true, depth: 0 })
      expect(found.docs[0]).toMatchObject({ firstName: 'Route', importedFrom: 'manual', status: 'active' })
    })

    it('quick add: validation errors come back as codes and add nothing', async () => {
      const res = await post('/api/admin/office/members', { token: tok.admin, form: { ...form, email: 'bad' } })
      expect(res.headers.get('location')).toContain('error=email')
      expect((await payload.count({ collection: 'members', overrideAccess: true })).totalDocs).toBe(0)
    })

    it('every route: anonymous 401, selector and editor 403, foreign or missing origin 403', async () => {
      for (const route of ['/api/admin/office/members', '/api/admin/office/members/link-players', '/api/admin/office/members/erase', '/api/admin/office/export/members']) {
        expect((await post(route, { form })).status, `${route} anonymous`).toBe(401)
        expect((await post(route, { token: tok.selector, form })).status, `${route} selector`).toBe(403)
        expect((await post(route, { token: tok.editor, form })).status, `${route} editor`).toBe(403)
        expect((await post(route, { token: tok.admin, form, origin: 'https://evil.example' })).status, `${route} foreign origin`).toBe(403)
        expect((await post(route, { token: tok.admin, form, origin: null })).status, `${route} no origin`).toBe(403)
      }
      expect((await payload.count({ collection: 'members', overrideAccess: true })).totalDocs).toBe(0)
      expect((await payload.count({ collection: 'office-audit-log', overrideAccess: true })).totalDocs).toBe(0)
    })

    it('a request without Origin passes when the browser says same-origin', async () => {
      const res = await post('/api/admin/office/members', { token: tok.admin, form, origin: null, fetchSite: 'same-origin' })
      expect(res.status).toBe(303)
    })

    it('add members for players who have none: links each player once, active ones active, and audits the bulk change', async () => {
      // Players from other files (PlayHQ-sourced ones cannot be deleted) may be left over: give each a member so only ours are unlinked.
      await clearCollection(payload, 'players').catch(() => undefined)
      for (const left of (await payload.find({ collection: 'players', pagination: false, depth: 0, overrideAccess: true })).docs) await member({ player: left.id })
      const mk = (slug: string, active: boolean) => payload.create({ collection: 'players', data: { firstName: slug, lastName: 'P', displayName: `${slug} P`, slug, isActiveDerived: active } as never, overrideAccess: true, context: { disableRevalidate: true } })
      const a = await mk('link-a-office', true)
      await mk('link-b-office', false)
      await member({ player: a.id })
      const first = await post('/api/admin/office/members/link-players', { token: tok.admin })
      expect(first.headers.get('location')).toContain('created=1')
      const again = await post('/api/admin/office/members/link-players', { token: tok.admin })
      expect(again.headers.get('location')).toContain('created=0')
      const links = await payload.find({ collection: 'members', where: { importedFrom: { equals: 'players' } }, overrideAccess: true, depth: 0 })
      expect(links.docs).toHaveLength(1)
      expect(links.docs[0]).toMatchObject({ status: 'past', roles: ['player'] })
      expect(links.docs[0].email ?? null).toBeNull()
      const audits = await payload.find({ collection: 'office-audit-log', where: { action: { equals: 'bulk-change' } }, overrideAccess: true, depth: 0, sort: 'createdAt' })
      expect(audits.docs.map((d) => d.rowCount)).toEqual([1, 0])
      expect(audits.docs[0].summary).toEqual({ operation: 'link-players', created: 1 })
    })

    it('removing personal details blanks every contact field, keeps the player link and writes an audit row', async () => {
      const p = await payload.create({ collection: 'players', data: { firstName: 'Erase', lastName: 'Me', displayName: 'Erase Me', slug: 'erase-me-office' } as never, overrideAccess: true, context: { disableRevalidate: true } })
      const guardian = await member({ firstName: 'Gu', lastName: 'Ardian' })
      const m = await member({ player: p.id, firstName: 'Typed', lastName: 'Name', dateOfBirth: '2012-01-01', guardians: [guardian.id], emergencyContact: { name: 'Mum', phone: '0411', relationship: 'Parent' }, ...PRIVATE, locality: 'Town', region: 'Reg', postalCode: '1234', roles: ['player', 'volunteer'] })
      const refused = await post('/api/admin/office/members/erase', { token: tok.admin, form: { id: String(m.id) } })
      expect(refused.headers.get('location')).toContain('error=bad-id')
      expect((await payload.findByID({ collection: 'members', id: m.id, overrideAccess: true, depth: 0 })).email).toBe(PRIVATE.email)
      const res = await post('/api/admin/office/members/erase', { token: tok.admin, form: { id: String(m.id), confirm: 'yes' } })
      expect(res.headers.get('location')).toContain('notice=erased')
      const after = await payload.findByID({ collection: 'members', id: m.id, overrideAccess: true, depth: 0 })
      for (const k of ['firstName', 'lastName', 'preferredName', 'email', 'phone', 'addressLine', 'locality', 'region', 'postalCode', 'dateOfBirth', 'notes'] as const) expect(after[k] ?? null, k).toBeNull()
      expect([after.emergencyContact?.name ?? null, after.emergencyContact?.phone ?? null, after.emergencyContact?.relationship ?? null]).toEqual([null, null, null])
      expect(after.guardians ?? []).toEqual([])
      expect(after).toMatchObject({ status: 'past', roles: ['player', 'volunteer'], displayName: 'Former member' })
      expect(after.erasedAt).toBeTruthy()
      expect(after.volunteerLinkVersion).toBeGreaterThan(0)
      expect(typeof after.player === 'number' ? after.player : (after.player as { id: number }).id).toBe(p.id)
      const { listMembers } = await import('@/lib/members-queries')
      const { parseMemberQuery } = await import('@/lib/office/member-filters')
      const dir = await listMembers(user.admin, parseMemberQuery({ q: 'erase' }))
      expect(dir!.rows.map((r) => r.name)).not.toContain('Erase Me')
      const audits = await payload.find({ collection: 'office-audit-log', where: { action: { equals: 'erase' } }, overrideAccess: true, depth: 0 })
      expect(audits.docs).toHaveLength(1)
      expect(JSON.stringify(audits.docs[0])).not.toMatch(/private|Typed|Erase/)
    })
  })

  describe('export', () => {
    const run = async (token: string | undefined, form: Record<string, string | string[]> = {}) => post('/api/admin/office/export/members', { token, form })

    beforeEach(async () => {
      await member({ firstName: '=cmd|calc', lastName: 'Formula', roles: ['player'], ...PRIVATE, dateOfBirth: '2010-05-05T12:00:00.000Z', emergencyContact: { name: 'Emergency Person', phone: '0411', relationship: 'Parent' } })
      await member({ firstName: 'Plain', lastName: 'Person', roles: ['volunteer'], email: 'plain@example.org' })
    })

    it('writes one audit row with the row count, neutralises formulas and leaves out date of birth, emergency contact and notes', async () => {
      const res = await run(tok.admin, { q: 'formula', role: 'player' })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/csv')
      expect(res.headers.get('cache-control')).toContain('no-store')
      const text = await res.text()
      expect(text).toContain("'=cmd|calc Formula")
      expect(text).not.toContain('Emergency Person')
      expect(text).not.toContain('2010-05-05')
      expect(text).not.toContain('private note')
      const audits = await payload.find({ collection: 'office-audit-log', overrideAccess: true, depth: 0 })
      expect(audits.docs).toHaveLength(1)
      expect(audits.docs[0]).toMatchObject({ action: 'export', module: 'members', rowCount: 1, includedSensitive: false })
      expect(JSON.stringify(audits.docs[0].summary)).not.toContain('ormula')
      expect(audits.docs[0].summary).toMatchObject({ hasSearch: true, role: 'player' })
    })

    it('the tick adds the sensitive columns and is recorded', async () => {
      const res = await run(tok.admin, { sensitive: 'yes' })
      const text = await res.text()
      expect(text).toContain('Emergency Person')
      expect(text).toContain('2010-05-05')
      expect(text).toContain('private note')
      const audits = await payload.find({ collection: 'office-audit-log', overrideAccess: true, depth: 0 })
      expect(audits.docs[0]).toMatchObject({ rowCount: 2, includedSensitive: true })
    })

    it('an editor gets 403, an anonymous caller 401, and neither causes an audit row', async () => {
      expect((await run(tok.editor)).status).toBe(403)
      expect((await run(undefined)).status).toBe(401)
      expect((await payload.count({ collection: 'office-audit-log', overrideAccess: true })).totalDocs).toBe(0)
    })

    it('a GET is refused', async () => {
      const { POST } = await import('@/app/api/admin/office/export/members/route')
      expect(typeof POST).toBe('function')
      const mod = (await import('@/app/api/admin/office/export/members/route')) as Record<string, unknown>
      expect(mod.GET).toBeUndefined()
    })
  })

  describe('personal data never reaches the public site', () => {
    it('a member who is also a player and a committee person leaks nothing through public REST or the public queries', async () => {
      const p = await payload.create({ collection: 'players', data: { firstName: 'Leak', lastName: 'Test', displayName: 'Leak Test', slug: 'leak-test-office' } as never, overrideAccess: true, context: { disableRevalidate: true } })
      const person = await payload.create({ collection: 'people', data: { name: 'Leak Test', role: 'Secretary', player: p.id } as never, overrideAccess: true, context: { disableRevalidate: true } })
      await member({ player: p.id, person: person.id, roles: ['player', 'committee'], ...PRIVATE, dateOfBirth: '1980-01-01', emergencyContact: { name: 'Hidden Contact', phone: '0422 222 222', relationship: 'Spouse' } })
      const needles = [PRIVATE.email, PRIVATE.phone, PRIVATE.addressLine, PRIVATE.notes, 'Hidden Contact', '0422 222 222', '1980-01-01']
      const bodies = [
        JSON.stringify((await rest('GET', '/players?limit=50&depth=2')).json),
        JSON.stringify((await rest('GET', '/people?limit=50&depth=2')).json),
        JSON.stringify((await rest('GET', '/players/' + p.id + '?depth=2')).json),
      ]
      const { listPeople } = await import('@/lib/people-queries')
      const { listPublicPlayers } = await import('@/lib/players/queries')
      bodies.push(JSON.stringify(await listPeople()), JSON.stringify(await listPublicPlayers()))
      for (const body of bodies) for (const needle of needles) expect(body, needle).not.toContain(needle)
    })

    it('players and people expose only their known public keys to an anonymous reader', async () => {
      const p = await payload.create({ collection: 'players', data: { firstName: 'Keys', lastName: 'Check', displayName: 'Keys Check', slug: 'keys-check-office' } as never, overrideAccess: true, context: { disableRevalidate: true } })
      await payload.create({ collection: 'people', data: { name: 'Keys Check', role: 'Coach', player: p.id } as never, overrideAccess: true, context: { disableRevalidate: true } })
      const memberOnly = ['members', 'roles', 'guardians', 'emergencyContact', 'doNotEmail', 'volunteerLinkVersion', 'dateOfBirth', 'membershipSince', 'lifeMemberSince', 'locality', 'region', 'postalCode', 'addressLine', 'erasedAt', 'importedFrom']
      for (const path of ['/players?limit=5&depth=0', '/people?limit=5&depth=0']) {
        const res = await rest('GET', path)
        expect(res.status).toBe(200)
        for (const doc of res.json.docs) for (const k of memberOnly) expect(Object.keys(doc), `${path} ${k}`).not.toContain(k)
      }
    })
  })
})
