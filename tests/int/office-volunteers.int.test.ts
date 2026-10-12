import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, tokenFor } from './helpers'
import { ipHit } from '@/lib/throttle'
import { seasonOfClubDate } from '@/lib/office/season'
import { volunteerToken } from '@/lib/volunteer-link'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))

/**
 * The volunteer roster and hours ledger (wave D WP-3) against real Postgres: who may roster, the confirm / reopen / confirm
 * cycle and the database's one-live-row rule, no-shows, the frozen week, the small-count rule end to end, the personal link, the
 * public answer route and the erase scrub. Nothing leaves the machine.
 */
const ORIGIN = 'http://localhost:3000'
const DAYS = { a: '2026-03-07', b: '2026-03-14', c: '2026-03-21' }
const RANGE = { from: '2026-01-01', to: '2026-12-31' }

describe('volunteer roster', () => {
  let payload: Payload
  const user: Record<string, never> = {} as never
  const tok: Record<string, string> = {}
  let people: { id: number; name: string }[] = []
  let outsider: number
  let q: typeof import('@/lib/volunteers-office-queries')
  let pub: typeof import('@/lib/volunteer-public')

  const create = (collection: string, data: Record<string, unknown>) =>
    payload.create({ collection: collection as never, data: data as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } }) as Promise<{ id: number } & Record<string, unknown>>
  const member = (first: string, extra: Record<string, unknown> = {}) => create('members', { firstName: first, lastName: 'Helper', roles: ['volunteer'], ...extra })
  const noon = (d: string) => `${d}T12:00:00.000Z`
  const wipe = async () => {
    for (const c of ['volunteer-hours', 'volunteer-availability', 'volunteer-assignments', 'volunteer-shifts', 'volunteer-weeks', 'selection-fixtures', 'members', 'office-audit-log'] as const) await clearCollection(payload, c)
    await payload.updateGlobal({ slug: 'office-settings', data: { shiftTypes: [{ key: 'canteen', label: 'Canteen', defaultHours: 3, defaultSlots: 2, kind: 'volunteer' }, { key: 'bar', label: 'Bar', defaultHours: 4, defaultSlots: 2, kind: 'volunteer' }, { key: 'gate', label: 'Gate', defaultHours: 2, defaultSlots: 1, kind: 'volunteer' }] } as never, overrideAccess: true })
  }
  /** A confirmed-ready week: a date, a canteen shift and the given people on it. */
  const weekWith = async (date: string, who: number[], key = 'canteen') => {
    expect(await q.addWeek(user.editor, { date, label: '' })).toMatchObject({ ok: true })
    const week = (await payload.find({ collection: 'volunteer-weeks', where: { date: { equals: noon(date) } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    expect(await q.addShift(user.editor, { weekId: week.id, shiftTypeKey: key })).toMatchObject({ ok: true })
    const shift = (await payload.find({ collection: 'volunteer-shifts', where: { week: { equals: week.id } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    for (const m of who) expect(await q.assign(user.editor, { shiftId: shift.id, memberId: m }), `assign ${m}`).toMatchObject({ ok: true })
    const assignments = (await payload.find({ collection: 'volunteer-assignments', where: { shift: { equals: shift.id } }, pagination: false, depth: 0, sort: 'id', overrideAccess: true })).docs
    return { week: week.id as number, shift: shift.id as number, assignments: assignments.map((a) => a.id as number) }
  }
  const hours = async (assignment?: number) =>
    (await payload.find({ collection: 'volunteer-hours', where: assignment ? { assignment: { equals: assignment } } : {}, pagination: false, depth: 0, sort: 'id', overrideAccess: true })).docs as unknown as { id: number; voidedAt?: string | null; member: number; hours: number; kind: string }[]
  const live = async (assignment?: number) => (await hours(assignment)).filter((h) => !h.voidedAt)

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    for (const role of ['admin', 'editor', 'selector'] as const) {
      tok[role] = await tokenFor(payload, role)
      const found = await payload.find({ collection: 'users', where: { email: { equals: `${role}@example.com` } }, limit: 1, depth: 0, overrideAccess: true })
      user[role] = { ...(found.docs[0] as object), collection: 'users' } as never
    }
    q = await import('@/lib/volunteers-office-queries')
    pub = await import('@/lib/volunteer-public')
  }, 120_000)
  afterAll(async () => {
    await wipe().catch(() => undefined)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await wipe()
    people = []
    for (const n of ['Ann', 'Ben', 'Cal', 'Dee', 'Eve']) people.push({ id: (await member(n)).id, name: `${n} Helper` })
    outsider = (await create('members', { firstName: 'Out', lastName: 'Sider', roles: ['supporter'] })).id
  })

  describe('who may roster', () => {
    it('lets an editor build and fill a week, but never reads or sets paid status', async () => {
      const w = await weekWith(DAYS.a, [people[0].id, people[1].id])
      const page = await q.getWeekPage(user.editor, w.week)
      expect(page!.shifts[0].assignments.map((a) => a.name).sort()).toEqual(['Ann Helper', 'Ben Helper'])
      expect(page!.shifts[0].assignments.every((a) => a.kind === undefined)).toBe(true)
      expect(page!.posted).toBeNull()
      // The kind came from the shift type in settings, not from anything posted.
      const rows = await payload.find({ collection: 'volunteer-assignments', pagination: false, depth: 0, overrideAccess: true })
      expect(rows.docs.every((a) => a.kind === 'volunteer')).toBe(true)
      const admin = await q.getWeekPage(user.admin, w.week)
      expect(admin!.shifts[0].assignments.every((a) => a.kind === 'volunteer')).toBe(true)
      expect(await q.setAssignmentKind(user.editor, w.assignments[0], 'paid')).toEqual({ ok: false, code: 'forbidden' })
      expect(await q.setAssignmentKind(user.admin, w.assignments[0], 'paid')).toMatchObject({ ok: true })
    })

    it('refuses anyone who is not committee, and people outside the roster list', async () => {
      const w = await weekWith(DAYS.a, [])
      for (const who of [undefined, user.selector]) {
        expect(await q.addWeek(who, { date: DAYS.b, label: '' })).toEqual({ ok: false, code: 'forbidden' })
        expect(await q.assign(who, { shiftId: w.shift, memberId: people[0].id })).toEqual({ ok: false, code: 'forbidden' })
        expect(await q.confirmWeek(who, w.week)).toEqual({ ok: false, code: 'forbidden' })
        expect(await q.getVolunteersPage(who, null)).toBeNull()
        expect(await q.getHoursReport(who, RANGE)).toBeNull()
      }
      expect(await q.assign(user.editor, { shiftId: w.shift, memberId: outsider })).toEqual({ ok: false, code: 'member' })
      expect(await q.assign(user.editor, { shiftId: w.shift, memberId: 999999 })).toEqual({ ok: false, code: 'member' })
    })

    it('takes people off, re-adds them, and keeps history rather than deleting hours', async () => {
      const w = await weekWith(DAYS.a, [people[0].id])
      expect(await q.unassign(user.editor, w.assignments[0])).toMatchObject({ ok: true })
      expect((await payload.count({ collection: 'volunteer-assignments', overrideAccess: true })).totalDocs).toBe(0)
      expect(await q.assign(user.editor, { shiftId: w.shift, memberId: people[0].id })).toMatchObject({ ok: true })
      // Confirm, reopen, take off: the assignment has hours history, so it is cancelled, not deleted.
      expect(await q.confirmWeek(user.editor, w.week)).toMatchObject({ ok: true })
      expect(await q.reopenWeek(user.editor, w.week)).toMatchObject({ ok: true })
      const [a] = (await payload.find({ collection: 'volunteer-assignments', pagination: false, depth: 0, overrideAccess: true })).docs
      expect(await q.unassign(user.editor, a.id)).toMatchObject({ ok: true })
      expect((await payload.findByID({ collection: 'volunteer-assignments', id: a.id, depth: 0, overrideAccess: true })).state).toBe('cancelled')
      expect((await hours()).length).toBe(1)
      expect(await q.assign(user.editor, { shiftId: w.shift, memberId: people[0].id })).toMatchObject({ ok: true })
      expect((await payload.findByID({ collection: 'volunteer-assignments', id: a.id, depth: 0, overrideAccess: true })).state).toBe('rostered')
    })

    it('warns about a double booking, over capacity and a No, without blocking', async () => {
      const w = await weekWith(DAYS.a, [people[0].id, people[1].id, people[2].id]) // canteen needs 2
      await q.addShift(user.editor, { weekId: w.week, shiftTypeKey: 'gate' })
      const gate = (await payload.find({ collection: 'volunteer-shifts', where: { shiftTypeKey: { equals: 'gate' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
      expect(await q.assign(user.editor, { shiftId: gate.id, memberId: people[0].id })).toMatchObject({ ok: true })
      await create('volunteer-availability', { member: people[1].id, week: w.week, state: 'no' })
      const kinds = (await q.getWeekPage(user.editor, w.week))!.warnings.map((x) => x.kind).sort()
      expect(kinds).toEqual(['double-booked', 'over-capacity', 'said-no'])
    })
  })

  describe('creating weeks', () => {
    it('makes one week per home game day in the season, once, and a second run adds nothing', async () => {
      const { seasonOfClubDate } = await import('@/lib/office/season')
      const season = seasonOfClubDate('2026-10-17').name
      const fx = (id: string, date: string, extra: Record<string, unknown> = {}) =>
        create('selection-fixtures', { gameId: id, gradeId: 'g', gradeName: 'A Grade', clubTeamId: 't', clubTeamName: 'Us', localDate: date, opponentName: 'Them', isHome: true, status: 'upcoming', ...extra })
      await fx('f1', '2026-10-17')
      await fx('f2', '2026-10-17') // another grade, same day
      await fx('f3', '2026-10-24', { isHome: false })
      await fx('f4', '2026-10-31', { status: 'removed' })
      await fx('f5', '2026-11-07')
      expect(await q.createWeeksForSeason(user.editor, season)).toMatchObject({ ok: true, n: 2 })
      expect(await q.createWeeksForSeason(user.editor, season)).toMatchObject({ ok: true, n: 0 })
      const weeks = (await payload.find({ collection: 'volunteer-weeks', pagination: false, sort: 'date', depth: 0, overrideAccess: true })).docs
      expect(weeks.map((w) => String(w.date).slice(0, 10))).toEqual(['2026-10-17', '2026-11-07'])
      expect(await q.createWeeksForSeason(user.editor, 'nonsense')).toEqual({ ok: false, code: 'season' })
      expect(await q.addWeek(user.editor, { date: '2026-10-17', label: '' })).toEqual({ ok: false, code: 'duplicate' })
    })
  })

  describe('the hours ledger', () => {
    it('confirm posts one row per assignment, a second confirm adds nothing and the week is frozen', async () => {
      const w = await weekWith(DAYS.a, [people[0].id, people[1].id])
      expect(await q.confirmWeek(user.editor, w.week)).toMatchObject({ ok: true })
      expect((await live()).length).toBe(2)
      expect(await q.confirmWeek(user.editor, w.week)).toEqual({ ok: false, code: 'already-confirmed' })
      expect((await live()).length).toBe(2)
      for (const r of await live()) expect(r).toMatchObject({ hours: 3, kind: 'volunteer' })
      // Frozen: nothing about the roster moves.
      expect(await q.assign(user.editor, { shiftId: w.shift, memberId: people[2].id })).toEqual({ ok: false, code: 'frozen' })
      expect(await q.unassign(user.editor, w.assignments[0])).toEqual({ ok: false, code: 'frozen' })
      expect(await q.setAssignmentKind(user.admin, w.assignments[0], 'paid')).toEqual({ ok: false, code: 'frozen' })
      expect(await q.addShift(user.editor, { weekId: w.week, shiftTypeKey: 'bar' })).toEqual({ ok: false, code: 'frozen' })
      expect(await q.deleteWeek(user.editor, w.week)).toEqual({ ok: false, code: 'frozen' })
    })

    it('confirm, reopen, confirm again leaves exactly one live row per assignment plus the voided one', async () => {
      const w = await weekWith(DAYS.a, [people[0].id, people[1].id])
      await q.confirmWeek(user.editor, w.week)
      expect(await q.reopenWeek(user.editor, w.week)).toMatchObject({ ok: true })
      expect((await live()).length).toBe(0)
      expect((await hours()).length).toBe(2)
      expect((await payload.findByID({ collection: 'volunteer-weeks', id: w.week, depth: 0, overrideAccess: true })).status).toBe('open')
      expect(await q.confirmWeek(user.editor, w.week)).toMatchObject({ ok: true })
      for (const a of w.assignments) {
        const rows = await hours(a)
        expect(rows.filter((r) => !r.voidedAt)).toHaveLength(1)
        expect(rows.filter((r) => r.voidedAt)).toHaveLength(1)
      }
    })

    it('a no-show voids that row, putting it back posts a new live row, and the second state change is refused where it makes no sense', async () => {
      const w = await weekWith(DAYS.a, [people[0].id, people[1].id])
      expect(await q.setAssignmentState(user.editor, w.assignments[0], 'no-show')).toEqual({ ok: false, code: 'not-confirmed' })
      await q.confirmWeek(user.editor, w.week)
      expect(await q.setAssignmentState(user.editor, w.assignments[0], 'no-show')).toMatchObject({ ok: true })
      expect(await live(w.assignments[0])).toHaveLength(0)
      expect(await live(w.assignments[1])).toHaveLength(1)
      expect(await q.setAssignmentState(user.editor, w.assignments[0], 'confirmed')).toMatchObject({ ok: true })
      const rows = await hours(w.assignments[0])
      expect(rows.filter((r) => !r.voidedAt)).toHaveLength(1)
      expect(rows.filter((r) => r.voidedAt)).toHaveLength(1)
      expect(await q.setAssignmentState(user.editor, w.assignments[0], 'no-show')).toMatchObject({ ok: true })
      // Reopen keeps a no-show a no-show, and re-confirming does not pay them.
      await q.reopenWeek(user.editor, w.week)
      await q.confirmWeek(user.editor, w.week)
      expect(await live(w.assignments[0])).toHaveLength(0)
    })

    it('the database itself refuses a second live row for one assignment, but not after a void', async () => {
      const w = await weekWith(DAYS.a, [people[0].id])
      const row = { member: people[0].id, date: noon(DAYS.a), hours: 3, kind: 'volunteer', source: 'roster', assignment: w.assignments[0] }
      const first = await create('volunteer-hours', row)
      await expect(create('volunteer-hours', row)).rejects.toThrow()
      await payload.update({ collection: 'volunteer-hours', id: first.id, data: { voidedAt: new Date().toISOString() } as never, overrideAccess: true })
      await expect(create('volunteer-hours', row)).resolves.toBeTruthy()
      // Manual rows have no assignment, so any number can exist.
      await create('volunteer-hours', { member: people[0].id, date: noon(DAYS.a), hours: 1, kind: 'volunteer', source: 'manual' })
      await expect(create('volunteer-hours', { member: people[0].id, date: noon(DAYS.a), hours: 1, kind: 'volunteer', source: 'manual' })).resolves.toBeTruthy()
    })

    it('two confirms at once still leave one live row per assignment', async () => {
      const w = await weekWith(DAYS.a, [people[0].id, people[1].id, people[2].id])
      const results = await Promise.all([q.confirmWeek(user.editor, w.week), q.confirmWeek(user.editor, w.week)])
      expect(results.some((r) => r.ok)).toBe(true)
      for (const a of w.assignments) expect(await live(a)).toHaveLength(1)
    })

    it('admins add hours for other work and void a mistake with a reason; editors cannot', async () => {
      const entry = { memberId: people[0].id, date: DAYS.a, hours: '2.5', kind: 'volunteer', shiftTypeKey: '', note: 'Working bee' }
      expect(await q.addManualHours(user.editor, entry)).toEqual({ ok: false, code: 'forbidden' })
      expect(await q.addManualHours(user.admin, { ...entry, hours: '30' })).toEqual({ ok: false, code: 'hours' })
      expect(await q.addManualHours(user.admin, { ...entry, date: '2999-01-01' })).toEqual({ ok: false, code: 'date' })
      expect(await q.addManualHours(user.admin, { ...entry, memberId: outsider })).toEqual({ ok: false, code: 'member' })
      expect(await q.addManualHours(user.admin, entry)).toMatchObject({ ok: true })
      const [row] = await live()
      expect(await q.voidHours(user.editor, { id: row.id, reason: 'x' })).toEqual({ ok: false, code: 'forbidden' })
      expect(await q.voidHours(user.admin, { id: row.id, reason: '' })).toEqual({ ok: false, code: 'reason' })
      expect(await q.voidHours(user.admin, { id: row.id, reason: 'Entered twice' })).toMatchObject({ ok: true })
      expect(await live()).toHaveLength(0)
      expect((await payload.findByID({ collection: 'volunteer-hours', id: row.id, depth: 0, overrideAccess: true })).voidReason).toBe('Entered twice')
    })

    it('reports paid and volunteer apart, hides a paid group under three people, and gives editors no names', async () => {
      // Three volunteers and two paid people (the bar is made a paid job for the day).
      const a = await weekWith(DAYS.a, [people[0].id, people[1].id, people[2].id], 'gate') // gate has one slot; extra people go over capacity (a warning only)
      await q.addShift(user.editor, { weekId: a.week, shiftTypeKey: 'bar' })
      const bar = (await payload.find({ collection: 'volunteer-shifts', where: { shiftTypeKey: { equals: 'bar' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
      for (const m of [people[3].id, people[4].id]) await q.assign(user.editor, { shiftId: bar.id, memberId: m })
      for (const id of (await payload.find({ collection: 'volunteer-assignments', where: { shift: { equals: bar.id } }, pagination: false, depth: 0, overrideAccess: true })).docs.map((d) => d.id)) {
        expect(await q.setAssignmentKind(user.admin, id as number, 'paid')).toMatchObject({ ok: true })
      }
      await q.confirmWeek(user.editor, a.week)

      const asEditor = (await q.getHoursReport(user.editor, { ...RANGE, season: seasonOfClubDate(DAYS.a).name }))!
      expect(asEditor.season).toBe(seasonOfClubDate(DAYS.a).name) // an editor's custom dates are ignored: ranges that differ by one day would isolate a person
      expect(asEditor.people).toBeNull()
      expect(asEditor.recent).toBeNull()
      const [vol, paid] = asEditor.aggregate
      expect(vol).toMatchObject({ kind: 'volunteer', state: 'shown', people: 3 })
      expect(paid).toEqual({ kind: 'paid', state: 'hidden' }) // two paid people: not reported, not recoverable
      expect(JSON.stringify(asEditor)).not.toMatch(/Helper|Ann|Ben/)

      const asAdmin = (await q.getHoursReport(user.admin, RANGE))!
      expect(asAdmin.people!.find((p) => p.name === 'Dee Helper')).toMatchObject({ paid: 4, volunteer: 0 })
      expect(asAdmin.people!.find((p) => p.name === 'Ann Helper')).toMatchObject({ paid: 0, volunteer: 2 })
      // A third paid person makes the group reportable, and its hours never leak into the volunteer figures.
      expect(await q.addManualHours(user.admin, { memberId: people[0].id, date: DAYS.b, hours: '1', kind: 'paid', shiftTypeKey: 'bar', note: '' })).toMatchObject({ ok: true })
      const again = (await q.getHoursReport(user.editor, { season: seasonOfClubDate(DAYS.a).name }))!.aggregate
      expect(again[1]).toMatchObject({ kind: 'paid', state: 'shown', people: 3 })
      expect(again[0]).toMatchObject({ kind: 'volunteer', people: 3 })
    })
  })

  describe('routes and exports', () => {
    const post = async (action: string, opts: { token?: string; origin?: string | null; form?: Record<string, string> } = {}) => {
      const body = new FormData()
      for (const [k, v] of Object.entries(opts.form ?? {})) body.append(k, v)
      const headers: Record<string, string> = {}
      if (opts.token) headers.Authorization = `JWT ${opts.token}`
      if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN
      headers.Accept = 'application/json' // these tests check the JSON refusal; the HTML redirect has its own test
      const mod = await import('@/app/api/admin/office/volunteers/[action]/route')
      return mod.POST(new Request(`${ORIGIN}/api/admin/office/volunteers/${action}`, { method: 'POST', headers, body }), { params: Promise.resolve({ action }) })
    }
    const exportPost = async (token: string | undefined, form: Record<string, string>) => {
      const body = new FormData()
      for (const [k, v] of Object.entries(form)) body.append(k, v)
      const headers: Record<string, string> = { Origin: ORIGIN }
      if (token) headers.Authorization = `JWT ${token}`
      const mod = await import('@/app/api/admin/office/export/volunteer-hours/route')
      return mod.POST(new Request(`${ORIGIN}/api/admin/office/export/volunteer-hours`, { method: 'POST', headers, body }))
    }

    it('answers 401 to nobody, 403 to a selector or a foreign origin, and works for an editor', async () => {
      expect((await post('week-add', { form: { date: DAYS.a } })).status).toBe(401)
      expect((await post('week-add', { token: tok.selector, form: { date: DAYS.a } })).status).toBe(403)
      expect((await post('week-add', { token: tok.editor, origin: 'https://evil.example', form: { date: DAYS.a } })).status).toBe(403)
      const ok = await post('week-add', { token: tok.editor, form: { date: DAYS.a, label: '', return: '/office/volunteers' } })
      expect(ok.status).toBe(303)
      expect(ok.headers.get('Location')).toContain('notice=week-added')
      expect((await payload.count({ collection: 'volunteer-weeks', overrideAccess: true })).totalDocs).toBe(1)
      expect((await post('nonsense', { token: tok.editor })).status).toBe(404)
    })

    it('ignores a crafted return address and keeps paid status out of an editor\'s hands', async () => {
      const r = await post('week-add', { token: tok.editor, form: { date: DAYS.b, return: 'https://evil.example/x' } })
      expect(r.headers.get('Location')).not.toContain('evil')
      const w = await weekWith(DAYS.c, [people[0].id])
      const res = await post('assignment-kind', { token: tok.editor, form: { id: String(w.assignments[0]), kind: 'paid', return: `/office/volunteers/week/${w.week}` } })
      expect(res.headers.get('Location')).toContain('error=forbidden')
      expect((await payload.findByID({ collection: 'volunteer-assignments', id: w.assignments[0], depth: 0, overrideAccess: true })).kind).toBe('volunteer')
      const hoursAdd = await post('hours-add', { token: tok.editor, form: { memberId: String(people[0].id), date: DAYS.a, hours: '2', kind: 'volunteer', return: '/office/volunteers/hours' } })
      expect(hoursAdd.headers.get('Location')).toContain('error=forbidden')
    })

    it('hours downloads are admin only, logged, formula-safe and keep the small-count rule', async () => {
      const w = await weekWith(DAYS.a, [people[0].id])
      await q.confirmWeek(user.editor, w.week)
      await payload.update({ collection: 'members', id: people[0].id, data: { firstName: '=HYPERLINK("http://x")' } as never, overrideAccess: true })
      expect((await exportPost(undefined, { scope: 'person' })).status).toBe(401)
      expect((await exportPost(tok.selector, { scope: 'person' })).status).toBe(403)
      expect((await exportPost(tok.editor, { scope: 'person' })).status).toBe(403)
      expect(await payload.count({ collection: 'office-audit-log', overrideAccess: true })).toMatchObject({ totalDocs: 0 })
      const person = await exportPost(tok.admin, { scope: 'person', from: RANGE.from, to: RANGE.to })
      expect(person.status).toBe(200)
      const csv = await person.text()
      expect(csv).not.toMatch(/(^|\n)"?=HYPERLINK/)
      expect(csv).toContain("'=HYPERLINK")
      const aggregate = await (await exportPost(tok.admin, { scope: 'aggregate', from: RANGE.from, to: RANGE.to })).text()
      expect(aggregate).not.toMatch(/Helper|HYPERLINK/)
      expect(aggregate).toContain('Fewer than 3 people')
      const audit = (await payload.find({ collection: 'office-audit-log', pagination: false, sort: 'id', depth: 0, overrideAccess: true })).docs
      expect(audit).toHaveLength(2)
      expect(audit[0]).toMatchObject({ action: 'export', module: 'volunteers', rowCount: 1, includedSensitive: false })
      expect(JSON.stringify(audit)).not.toMatch(/Helper|HYPERLINK/)
    })
  })

  describe('the personal link', () => {
    it('opens for the right person, dies when rotated, archived or erased, and cannot be replayed for someone else', async () => {
      const [ann, ben] = people
      const t = volunteerToken(ann.id, 0)
      expect(await pub.resolveVolunteer(payload, t)).toEqual({ id: ann.id, firstName: 'Ann' })
      const swapped = `${Buffer.from(String(ben.id)).toString('base64url')}.${t.split('.')[1]}`
      expect(await pub.resolveVolunteer(payload, swapped)).toBeNull()
      expect(await pub.resolveVolunteer(payload, 'garbage')).toBeNull()
      expect(await pub.resolveVolunteer(payload, volunteerToken(999999, 0))).toBeNull()

      expect(await q.rotateVolunteerLink(user.editor, ann.id)).toMatchObject({ ok: true })
      expect(await pub.resolveVolunteer(payload, t)).toBeNull()
      expect(await pub.resolveVolunteer(payload, volunteerToken(ann.id, 1))).not.toBeNull()
      expect(await q.rotateVolunteerLink(user.editor, outsider)).toEqual({ ok: false, code: 'member' })
      expect(await q.rotateVolunteerLink(user.selector, ann.id)).toEqual({ ok: false, code: 'forbidden' })

      await payload.update({ collection: 'members', id: ben.id, data: { status: 'past' } as never, overrideAccess: true })
      expect(await pub.resolveVolunteer(payload, volunteerToken(ben.id, 0))).toBeNull()
      expect(await pub.resolveVolunteer(payload, volunteerToken(ben.id, 1))).toBeNull() // past members have no link at all

      const cal = people[2]
      const { eraseMemberDetails } = await import('@/lib/office/erase')
      expect(await eraseMemberDetails(payload, user.admin, cal.id)).toEqual({ ok: true })
      expect(await pub.resolveVolunteer(payload, volunteerToken(cal.id, 0))).toBeNull()
    })

    it('shows the open weeks and the person\'s own shifts only, and never another person', async () => {
      const [ann, ben] = people
      const w = await weekWith('2999-03-07', [ann.id, ben.id])
      await q.setWeekStatus(user.editor, w.week, 'open')
      await create('volunteer-availability', { member: ben.id, week: w.week, state: 'yes', note: 'Ben only note' })
      const view = await pub.volunteerView(payload, ann.id, '2026-10-12')
      expect(view.weeks).toHaveLength(1)
      expect(view.weeks[0]).toMatchObject({ answer: null })
      expect(view.shifts).toEqual([{ weekId: w.week, date: '2999-03-07', job: 'Canteen', hours: 3, state: 'rostered' }])
      const json = JSON.stringify(view)
      expect(json).not.toMatch(/Ben|Helper|only note/)
      // A draft week is not shown at all, even to someone rostered on it.
      await q.setWeekStatus(user.editor, w.week, 'draft')
      const hidden = await pub.volunteerView(payload, ann.id, '2026-10-12')
      expect(hidden.weeks).toHaveLength(0)
      expect(hidden.shifts).toHaveLength(0) // a draft roster is not disclosed either
    })

    it('saves an answer for the person the token names, once per week, and refuses closed weeks and bad input', async () => {
      const [ann] = people
      const w = await weekWith('2999-03-07', [])
      const input = (extra: Record<string, unknown> = {}) => ({ weekId: w.week, state: 'yes', note: 'Early is best', preferred: ['canteen'], ...extra })
      expect(await pub.answerWeek(payload, ann.id, '2026-10-12', input())).toBe('closed') // still a draft
      await q.setWeekStatus(user.editor, w.week, 'open')
      expect(await pub.answerWeek(payload, ann.id, '2026-10-12', input())).toBe('saved')
      expect(await pub.answerWeek(payload, ann.id, '2026-10-12', input({ state: 'maybe', note: '' }))).toBe('saved')
      const rows = (await payload.find({ collection: 'volunteer-availability', pagination: false, depth: 0, overrideAccess: true })).docs
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ state: 'maybe', note: null })
      expect(rows[0].member).toBe(ann.id)
      expect(await pub.answerWeek(payload, ann.id, '2026-10-12', input({ state: 'sure' }))).toBe('state')
      expect(await pub.answerWeek(payload, ann.id, '2026-10-12', input({ note: '4111 1111 1111 1111' }))).toBe('note')
      expect(await pub.answerWeek(payload, ann.id, '2026-10-12', input({ preferred: ['nope'] }))).toBe('shifts')
      expect(await pub.answerWeek(payload, ann.id, '2026-10-12', input({ weekId: 999999 }))).toBe('closed')
      expect(await pub.answerWeek(payload, ann.id, '3000-01-01', input())).toBe('closed') // the day has passed
      // The roster sees the answer.
      expect((await q.getWeekPage(user.editor, w.week))!.answers).toEqual([{ memberId: ann.id, name: 'Ann Helper', state: 'maybe', note: null }])
    })

    it('counts only failed links against the address; a valid link is never throttled', async () => {
      const good = volunteerToken(people[0].id, 0)
      for (let i = 0; i < 65; i++) expect(await pub.resolveVolunteerCounted(payload, good, '203.0.113.9')).not.toBeNull()
      expect((await ipHit(payload, 'vol-bad', '203.0.113.9')).allowed).toBe(true) // 65 valid looks counted nothing
      for (let i = 0; i < 65; i++) await pub.resolveVolunteerCounted(payload, 'not-a-link', '203.0.113.9')
      expect((await ipHit(payload, 'vol-bad', '203.0.113.9')).allowed).toBe(false) // 30 bad checks lock the address
      expect((await ipHit(payload, 'vol-bad', '203.0.113.10')).allowed).toBe(true) // another address is unaffected
    })
  })

  describe('settings, deletes and erasure', () => {
    it('keeps the code of a job that is in use: it can be renamed but not removed', async () => {
      await weekWith(DAYS.a, [people[0].id], 'bar')
      const keep = [{ key: 'bar', label: 'Kiosk', defaultHours: 4, defaultSlots: 2, kind: 'volunteer' }]
      await expect(payload.updateGlobal({ slug: 'office-settings', data: { shiftTypes: keep } as never, overrideAccess: true })).resolves.toBeTruthy()
      const err = await payload.updateGlobal({ slug: 'office-settings', data: { shiftTypes: [{ key: 'gate', label: 'Gate', defaultHours: 2, defaultSlots: 1, kind: 'volunteer' }] } as never, overrideAccess: true }).catch((e) => JSON.stringify((e as { data?: unknown }).data ?? e))
      expect(String(err)).toMatch(/already used/)
      // History keeps the name it was created with.
      const shift = (await payload.find({ collection: 'volunteer-shifts', limit: 1, depth: 0, overrideAccess: true })).docs[0]
      expect(shift.labelSnapshot).toBe('Bar')
    })

    it('does not delete a member who has volunteer records, and an erase blanks their availability note', async () => {
      const w = await weekWith(DAYS.a, [people[0].id])
      await create('volunteer-availability', { member: people[1].id, week: w.week, state: 'yes', note: 'I live at 5 High St' })
      await expect(payload.delete({ collection: 'members', id: people[0].id, overrideAccess: true })).rejects.toThrow()
      const { eraseMemberDetails } = await import('@/lib/office/erase')
      expect(await eraseMemberDetails(payload, user.admin, people[1].id)).toEqual({ ok: true })
      const [row] = (await payload.find({ collection: 'volunteer-availability', depth: 0, overrideAccess: true })).docs
      expect(row).toMatchObject({ state: 'yes', note: null })
    })

    it('removes an empty game day with its answers, but not one with people on it', async () => {
      const full = await weekWith(DAYS.a, [people[0].id])
      expect(await q.deleteWeek(user.editor, full.week)).toEqual({ ok: false, code: 'has-people' })
      const empty = await weekWith(DAYS.b, [])
      await create('volunteer-availability', { member: people[0].id, week: empty.week, state: 'no' })
      expect(await q.removeShift(user.editor, full.shift)).toEqual({ ok: false, code: 'has-people' })
      expect(await q.deleteWeek(user.editor, empty.week)).toMatchObject({ ok: true })
      expect(await payload.count({ collection: 'volunteer-availability', overrideAccess: true })).toMatchObject({ totalDocs: 0 })
      expect(await payload.count({ collection: 'volunteer-shifts', where: { week: { equals: empty.week } }, overrideAccess: true })).toMatchObject({ totalDocs: 0 })
    })

    it('finds the next game day for the landing line and the notification', async () => {
      const { currentClubDate } = await import('@/lib/selection/club-date')
      const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
      const w = await weekWith(soon, [people[0].id])
      const g = await q.nextGameDay(user.editor)
      expect(g).toMatchObject({ weekId: w.week, slots: 2, empty: 1 })
      expect(g!.daysAway).toBeLessThanOrEqual(3)
      expect(g!.date >= currentClubDate()).toBe(true)
      expect(await q.nextGameDay(user.selector)).toBeNull()
      await q.confirmWeek(user.editor, w.week)
      expect(await q.nextGameDay(user.editor)).toBeNull() // confirmed weeks are done
    })
  })
})
