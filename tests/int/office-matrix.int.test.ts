import type { CollectionSlug, Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))

/**
 * Who can do what with the club office data (wave D spec 3.4): every office collection x anonymous / selector / editor / admin x
 * find, findByID, count, create, update, delete, through the Local API with the access rules switched ON, plus the REST path.
 * `EXPECTED` is the single source of truth and each work package appends its collections; the docs table is written from it.
 */
type Op = 'find' | 'findByID' | 'count' | 'create' | 'update' | 'delete'
const OPS: Op[] = ['find', 'findByID', 'count', 'create', 'update', 'delete']
const ALL: Op[] = OPS
const READ: Op[] = ['find', 'findByID', 'count']

/** Operations each role may do. Anything not listed is denied. */
const EXPECTED: Record<string, Record<'anonymous' | 'selector' | 'editor' | 'admin', Op[]>> = {
  members: { anonymous: [], selector: [], editor: [], admin: ALL },
  // The log can be read by admins and written by nobody over REST or the admin; server code writes with the access override.
  'office-audit-log': { anonymous: [], selector: [], editor: [], admin: READ },
  // WP-2: tiers and memberships are admin-managed; the ledger collections are read-only for admins (only the Fees actions write).
  'membership-tiers': { anonymous: [], selector: [], editor: [], admin: ALL },
  memberships: { anonymous: [], selector: [], editor: [], admin: ALL },
  'fee-seasons': { anonymous: [], selector: [], editor: [], admin: READ },
  'fee-charges': { anonymous: [], selector: [], editor: [], admin: READ },
  'fee-payments': { anonymous: [], selector: [], editor: [], admin: READ },
  'fee-waivers': { anonymous: [], selector: [], editor: [], admin: READ },
  // WP-3: the roster is the committee's to read (nobody writes over REST; the roster actions write); the per-person hours ledger is admin only.
  'volunteer-weeks': { anonymous: [], selector: [], editor: READ, admin: READ },
  'volunteer-shifts': { anonymous: [], selector: [], editor: READ, admin: READ },
  'volunteer-assignments': { anonymous: [], selector: [], editor: READ, admin: READ },
  'volunteer-availability': { anonymous: [], selector: [], editor: READ, admin: READ },
  'volunteer-hours': { anonymous: [], selector: [], editor: [], admin: READ },
  // WP-4: the committee reads seats and unrestricted meeting data (restricted rows and the documents are covered in office-meetings.int.test.ts, which has an
  // office-bearer editor as a fifth persona). Seats are admin-edited; agendas are the committee's to edit; nobody writes meetings over REST, not even an admin.
  'committee-seats': { anonymous: [], selector: [], editor: READ, admin: ALL },
  'meeting-templates': { anonymous: [], selector: [], editor: [...READ, 'create', 'update'], admin: ALL },
  meetings: { anonymous: [], selector: [], editor: READ, admin: READ },
  'meeting-items': { anonymous: [], selector: [], editor: READ, admin: READ },
  'meeting-attendance': { anonymous: [], selector: [], editor: READ, admin: READ },
  'meeting-motions': { anonymous: [], selector: [], editor: READ, admin: READ },
  'meeting-actions': { anonymous: [], selector: [], editor: READ, admin: READ },
  // WP-5: the diary and plan are club figures, not personal data, so the committee edits them natively and only an admin deletes.
  'plan-pillars': { anonymous: [], selector: [], editor: [...READ, 'create', 'update'], admin: ALL },
  'plan-objectives': { anonymous: [], selector: [], editor: [...READ, 'create', 'update'], admin: ALL },
  'diary-jobs': { anonymous: [], selector: [], editor: [...READ, 'create', 'update'], admin: ALL },
}

/** A valid row for each collection (the matrix probes with real data, so a validation failure cannot read as "denied"). */
type Ctx = { member: number; probeMember: number; tier: number; probeTier: number; week: number; probeWeek: number; shift: number; meeting: number; pillar: number; n: number; probe: boolean }
const SAMPLE: Record<string, (ctx: Ctx) => Record<string, unknown>> = {
  members: ({ n }) => ({ firstName: 'Probe', lastName: `Row${n}`, roles: ['supporter'] }),
  'office-audit-log': () => ({ at: new Date().toISOString(), action: 'export', module: 'members' }),
  'membership-tiers': ({ n }) => ({ season: '2031/32', name: `Probe ${n}`, kind: 'free' }),
  // The seeded row sits in 2031/32; probes use 2032/33 so the one-membership-per-season rule cannot read as a denial.
  memberships: ({ member, tier, probeTier, probe }) => ({ member, tier: probe ? probeTier : tier, season: probe ? '2032/33' : '2031/32' }),
  'fee-seasons': ({ n }) => ({ season: `20${40 + (n % 50)}/${41 + (n % 50)}`, status: 'open' }),
  'fee-charges': ({ member }) => ({ member, season: '2031/32', kind: 'game', date: new Date().toISOString(), amountCents: 100 }),
  'fee-payments': ({ member }) => ({ member, receivedOn: new Date().toISOString(), amountCents: 100, method: 'cash' }),
  'fee-waivers': ({ member }) => ({ member, scope: 'amount', amountCents: 100, note: 'probe' }),
  // Every probe gets its own date, and the unique (shift, member) and (member, week) pairs use a second member and week, so a clash cannot read as a denial.
  'volunteer-weeks': ({ n }) => ({ season: '2040/41', date: new Date(Date.UTC(2040, 0, 1 + n, 12)).toISOString(), status: 'draft' }),
  'volunteer-shifts': ({ week }) => ({ week, shiftTypeKey: 'canteen', labelSnapshot: 'Canteen', hours: 2, slots: 1 }),
  'volunteer-assignments': ({ shift, member, probeMember, probe }) => ({ shift, member: probe ? probeMember : member, hours: 2, kind: 'volunteer', state: 'rostered' }),
  'volunteer-availability': ({ member, week, probeWeek, probe }) => ({ member, week: probe ? probeWeek : week, state: 'yes' }),
  'volunteer-hours': ({ member }) => ({ member, date: new Date().toISOString(), hours: 1, kind: 'volunteer', source: 'manual' }),
  'committee-seats': ({ n }) => ({ title: `Probe seat ${n}` }),
  'meeting-templates': ({ n }) => ({ name: `Probe agenda ${n}`, kind: 'ordinary', items: [{ title: 'Welcome', kind: 'welcome' }] }),
  meetings: ({ n }) => ({ title: `Probe meeting ${n}`, kind: 'ordinary', startsAt: new Date().toISOString(), status: 'planned', restricted: false }),
  'meeting-items': ({ meeting }) => ({ meeting, order: 1, title: 'Welcome', kind: 'welcome' }),
  'meeting-attendance': ({ meeting }) => ({ meeting, guestName: 'Guest', state: 'present' }),
  'meeting-motions': ({ meeting }) => ({ meeting, text: 'A motion', result: 'carried' }),
  'meeting-actions': ({ meeting }) => ({ meeting, text: 'An action', status: 'open' }),
  'plan-pillars': ({ n }) => ({ title: `Probe pillar ${n}` }),
  'plan-objectives': ({ pillar, n }) => ({ pillar, title: `Probe objective ${n}` }),
  'diary-jobs': ({ n }) => ({ title: `Probe job ${n}`, season: '2026/27', status: 'todo' }),
}
const PATCH: Record<string, Record<string, unknown>> = {
  members: { notes: 'x' },
  'office-audit-log': { module: 'other' },
  'membership-tiers': { name: 'Renamed probe' },
  memberships: { note: 'probe' },
  'fee-seasons': { snapshotCount: 1 },
  'fee-charges': { description: 'probe' },
  'fee-payments': { note: 'probe' },
  'fee-waivers': { note: 'changed' },
  'volunteer-weeks': { label: 'changed' },
  'volunteer-shifts': { slots: 3 },
  'volunteer-assignments': { hours: 3 },
  'volunteer-availability': { note: 'changed' },
  'volunteer-hours': { note: 'changed' },
  'committee-seats': { handoverNote: 'changed' },
  'meeting-templates': { name: 'Renamed agenda' },
  meetings: { venue: 'changed' },
  'meeting-items': { notes: 'changed' },
  'meeting-attendance': { state: 'absent' },
  'meeting-motions': { text: 'changed' },
  'meeting-actions': { text: 'changed' },
  'plan-pillars': { summary: 'changed' },
  'plan-objectives': { progressNote: 'changed' },
  'diary-jobs': { notes: 'changed' },
}

describe('office access matrix', () => {
  let payload: Payload
  const users: Record<string, { id: number; role: string; collection: 'users' } | undefined> = { anonymous: undefined }
  const tokens: Record<string, string> = {}
  const seeded: Record<string, number> = {}
  const ctx: Ctx = { member: 0, probeMember: 0, tier: 0, probeTier: 0, week: 0, probeWeek: 0, shift: 0, meeting: 0, pillar: 0, n: 0, probe: false }
  const wipe = async () => {
    for (const c of ['diary-jobs', 'plan-objectives', 'plan-pillars', 'meeting-actions', 'meeting-motions', 'meeting-attendance', 'meeting-items', 'meetings', 'meeting-templates', 'committee-seats', 'volunteer-hours', 'volunteer-availability', 'volunteer-assignments', 'volunteer-shifts', 'volunteer-weeks', 'fee-payments', 'fee-waivers', 'fee-charges', 'fee-seasons', 'memberships', 'membership-tiers', 'members', 'office-audit-log'] as const) await clearCollection(payload, c)
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    for (const role of ['admin', 'editor', 'selector'] as const) {
      tokens[role] = await tokenFor(payload, role)
      const found = await payload.find({ collection: 'users', where: { email: { equals: `${role}@example.com` } }, limit: 1, depth: 0, overrideAccess: true })
      users[role] = { ...(found.docs[0] as unknown as { id: number; role: string }), collection: 'users' }
    }
    await wipe()
    const m = await payload.create({ collection: 'members', data: { firstName: 'Matrix', lastName: 'Member', roles: ['supporter'], email: 'matrix@example.org' } as never, overrideAccess: true })
    seeded.members = m.id
    ctx.member = m.id
    ctx.probeMember = (await payload.create({ collection: 'members', data: { firstName: 'Matrix', lastName: 'Probe', roles: ['supporter'] } as never, overrideAccess: true })).id
    const a = await payload.create({ collection: 'office-audit-log', data: { at: new Date().toISOString(), action: 'export', module: 'members', rowCount: 1 }, overrideAccess: true })
    seeded['office-audit-log'] = a.id
    for (const slug of Object.keys(SAMPLE).filter((s) => !(s in seeded))) {
      const row = await payload.create({ collection: slug as CollectionSlug, data: SAMPLE[slug](ctx) as never, overrideAccess: true })
      seeded[slug] = row.id
      if (slug === 'volunteer-weeks') {
        ctx.week = row.id
        ctx.probeWeek = (await payload.create({ collection: 'volunteer-weeks', data: { season: '2040/41', date: new Date(Date.UTC(2039, 5, 1, 12)).toISOString(), status: 'draft' } as never, overrideAccess: true })).id
      }
      if (slug === 'volunteer-shifts') ctx.shift = row.id
      if (slug === 'meetings') ctx.meeting = row.id
      if (slug === 'plan-pillars') ctx.pillar = row.id
      if (slug === 'membership-tiers') {
        ctx.tier = row.id
        ctx.probeTier = (await payload.create({ collection: 'membership-tiers', data: { season: '2032/33', name: 'Probe tier', kind: 'free' } as never, overrideAccess: true })).id
      }
    }
    ctx.n = 1000
  }, 120_000)

  afterAll(async () => {
    await wipe()
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })

  const attempt = async (slug: string, op: Op, who: string): Promise<boolean> => {
    const collection = slug as CollectionSlug
    const user = users[who] as never
    const base = { collection, user, overrideAccess: false, depth: 0 } as const
    const data = SAMPLE[slug]({ ...ctx, n: ++ctx.n, probe: true })
    try {
      switch (op) {
        case 'find': {
          const r = await payload.find({ ...base, limit: 5 })
          return r.docs.length > 0
        }
        case 'findByID':
          return Boolean(await payload.findByID({ ...base, id: seeded[slug] }))
        case 'count': {
          const r = await payload.count({ collection, user, overrideAccess: false })
          return r.totalDocs > 0
        }
        case 'create': {
          const r = await payload.create({ ...base, data: data as never })
          await payload.delete({ collection, id: r.id, overrideAccess: true })
          return true
        }
        case 'update':
          return Boolean(await payload.update({ ...base, id: seeded[slug], data: PATCH[slug] as never }))
        case 'delete': {
          // Delete a throw-away row so the seeded one stays for later cases.
          const probe = await payload.create({ collection, data: data as never, overrideAccess: true })
          try {
            await payload.delete({ ...base, id: probe.id })
            return true
          } finally {
            await payload.delete({ collection, id: probe.id, overrideAccess: true }).catch(() => undefined)
          }
        }
      }
    } catch {
      return false
    }
  }

  for (const [slug, table] of Object.entries(EXPECTED)) {
    for (const who of ['anonymous', 'selector', 'editor', 'admin'] as const) {
      it(`${slug}: ${who} may ${table[who].join(', ') || 'do nothing'}`, async () => {
        for (const op of OPS) expect(await attempt(slug, op, who), `${slug} ${op} as ${who}`).toBe(table[who].includes(op))
      })
    }
  }

  it('an editor reads the roster but never sees whether an assignment is paid; an admin does', async () => {
    const asEditor = await payload.findByID({ collection: 'volunteer-assignments', id: seeded['volunteer-assignments'], user: users.editor as never, overrideAccess: false, depth: 0 })
    expect('kind' in asEditor).toBe(false)
    const asAdmin = await payload.findByID({ collection: 'volunteer-assignments', id: seeded['volunteer-assignments'], user: users.admin as never, overrideAccess: false, depth: 0 })
    expect(asAdmin.kind).toBe('volunteer')
    const viaRest = await rest('GET', `/volunteer-assignments/${seeded['volunteer-assignments']}`, { token: tokens.editor })
    expect(viaRest.status).toBe(200)
    expect('kind' in viaRest.json).toBe(false)
  })

  it('REST: members and the log answer 401/403 to everyone but an admin; the settings global too', async () => {
    const denied = (s: number) => s === 401 || s === 403
    for (const path of ['/members', `/members/${seeded.members}`, '/office-audit-log', '/globals/office-settings']) {
      expect(denied((await rest('GET', path)).status), `${path} anonymous`).toBe(true)
      expect(denied((await rest('GET', path, { token: tokens.selector })).status), `${path} selector`).toBe(true)
      expect(denied((await rest('GET', path, { token: tokens.editor })).status), `${path} editor`).toBe(true)
      expect((await rest('GET', path, { token: tokens.admin })).status, `${path} admin`).toBe(200)
    }
    expect(denied((await rest('POST', '/members', { token: tokens.editor, body: { firstName: 'A', lastName: 'B', roles: ['other'] } })).status)).toBe(true)
    expect(denied((await rest('POST', '/globals/office-settings', { token: tokens.editor, body: { currency: 'USD' } })).status)).toBe(true)
  })

  it('an admin cannot write the audit log over REST either, and server-owned member fields ignore REST writes', async () => {
    const denied = (s: number) => s === 401 || s === 403
    expect(denied((await rest('POST', '/office-audit-log', { token: tokens.admin, body: { at: new Date().toISOString(), action: 'export', module: 'x' } })).status)).toBe(true)
    const patched = await rest('PATCH', `/members/${seeded.members}`, { token: tokens.admin, body: { volunteerLinkVersion: 99, erasedAt: new Date().toISOString() } })
    expect(patched.status).toBe(200)
    const row = await payload.findByID({ collection: 'members', id: seeded.members, overrideAccess: true, depth: 0 })
    expect(row.volunteerLinkVersion ?? 0).not.toBe(99)
    expect(row.erasedAt ?? null).toBeNull()
  })
})
