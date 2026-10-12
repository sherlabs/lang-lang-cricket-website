import { describe, expect, it } from 'vitest'
import { claimedMemberId, volunteerToken, volunteerTokenMatches } from '../lib/volunteer-link'
import {
  aggregateHours,
  fillStatus,
  hoursByPerson,
  parseAvailability,
  planConfirm,
  planReopen,
  rankCandidates,
  rosterWarnings,
  smallCountTable,
  validateManualHours,
  validateShiftTypes,
  validateWeekInput,
  weekDatesFromFixtures,
  type AssignmentRow,
  type HoursRow,
  type ShiftRow,
} from '../lib/office/volunteers'
import { DEFAULT_SHIFT_TYPES } from '../lib/office/settings-defaults'
import { resolveOfficeSettings } from '../lib/office/settings'

const SECRET = 'unit-test-secret'

describe('volunteer personal links', () => {
  it('signs, verifies and recovers the claimed member', () => {
    const t = volunteerToken(42, 0, SECRET)
    expect(claimedMemberId(t)).toBe(42)
    expect(volunteerTokenMatches(t, 42, 0, SECRET)).toBe(true)
  })
  it('rotating the version kills the old token', () => {
    const t = volunteerToken(42, 0, SECRET)
    expect(volunteerTokenMatches(t, 42, 1, SECRET)).toBe(false)
    expect(volunteerTokenMatches(volunteerToken(42, 1, SECRET), 42, 1, SECRET)).toBe(true)
  })
  it('cannot be replayed for another member, tampered with or built from nothing', () => {
    const t = volunteerToken(42, 0, SECRET)
    const other = `${Buffer.from('43').toString('base64url')}.${t.split('.')[1]}`
    expect(volunteerTokenMatches(other, 43, 0, SECRET)).toBe(false)
    expect(volunteerTokenMatches(`${t}x`, 42, 0, SECRET)).toBe(false)
    expect(volunteerTokenMatches(t, 42, 0, 'another-secret')).toBe(false)
    for (const bad of ['', 'abc', 'a.b.c', null, undefined, '..', `${Buffer.from('-1').toString('base64url')}.x`, `${Buffer.from('1.5').toString('base64url')}.x`]) {
      expect(claimedMemberId(bad as string), String(bad)).toBeNull()
      expect(volunteerTokenMatches(bad as string, 1, 0, SECRET)).toBe(false)
    }
  })
  it('does not accept a non-canonical id encoding', () => {
    expect(claimedMemberId(`${Buffer.from('042').toString('base64url')}.x`)).toBeNull()
  })
})

describe('shift types', () => {
  const ok = [{ key: 'canteen', label: 'Canteen', defaultHours: 3, defaultSlots: 2, kind: 'volunteer' as const }]
  it('accepts the defaults', () => {
    expect(validateShiftTypes(DEFAULT_SHIFT_TYPES)).toBeNull()
  })
  it('rejects bad codes, duplicates, hours and slots', () => {
    expect(validateShiftTypes([{ ...ok[0], key: 'Bad Key' }])).toMatch(/short code/)
    expect(validateShiftTypes([...ok, ...ok])).toMatch(/twice/)
    expect(validateShiftTypes([{ ...ok[0], defaultHours: 0 }])).toMatch(/hours/)
    expect(validateShiftTypes([{ ...ok[0], defaultHours: 30 }])).toMatch(/hours/)
    expect(validateShiftTypes([{ ...ok[0], defaultSlots: 0 }])).toMatch(/whole number/)
    expect(validateShiftTypes([{ ...ok[0], label: ' ' }])).toMatch(/name/)
  })
  it('a code in use cannot be removed; a label can change', () => {
    expect(validateShiftTypes([{ ...ok[0], label: 'Kiosk' }], ['canteen'])).toBeNull()
    expect(validateShiftTypes([{ ...ok[0], key: 'kiosk' }], ['canteen'])).toMatch(/already used/)
  })
  it('settings fall back to the defaults when none are saved', () => {
    expect(resolveOfficeSettings(null).shiftTypes.map((t) => t.key)).toEqual(['canteen', 'bar', 'gate'])
    expect(resolveOfficeSettings({ shiftTypes: [{ key: 'scorer', label: 'Scorer', defaultHours: 5, defaultSlots: 1, kind: 'paid' }] }).shiftTypes).toEqual([{ key: 'scorer', label: 'Scorer', defaultHours: 5, defaultSlots: 1, kind: 'paid' }])
    expect(resolveOfficeSettings({ shiftTypes: [] }).shiftTypes).toHaveLength(3)
  })
})

describe('creating weeks', () => {
  const fx = [
    { localDate: '2026-10-17', isHome: true, status: 'upcoming' },
    { localDate: '2026-10-17', isHome: true, status: 'upcoming' }, // a second grade the same day
    { localDate: '2026-10-24', isHome: false, status: 'upcoming' },
    { localDate: '2026-10-31', isHome: true, status: 'removed' },
    { localDate: '2026-11-07', isHome: true, status: 'final' },
    { localDate: '2027-09-01', isHome: true, status: 'upcoming' }, // next season
    { localDate: 'nonsense', isHome: true, status: 'upcoming' },
  ]
  it('keeps home, not-removed dates in the season, once each, minus existing weeks', () => {
    expect(weekDatesFromFixtures(fx, '2026/27', [])).toEqual(['2026-10-17', '2026-11-07'])
    expect(weekDatesFromFixtures(fx, '2026/27', ['2026-10-17'])).toEqual(['2026-11-07'])
    expect(weekDatesFromFixtures(fx, 'garbage', [])).toEqual([])
  })
  it('validates a manual week', () => {
    expect(validateWeekInput({ date: '2026-10-17', label: ' Round 3 ' }, [])).toEqual({ ok: true, date: '2026-10-17', label: 'Round 3' })
    expect(validateWeekInput({ date: '2026-02-31', label: '' }, [])).toEqual({ ok: false, error: 'date' })
    expect(validateWeekInput({ date: '2026-10-17', label: '' }, ['2026-10-17'])).toEqual({ ok: false, error: 'duplicate' })
    expect(validateWeekInput({ date: '2026-10-17', label: '4111 1111 1111 1111' }, [])).toEqual({ ok: false, error: 'label' })
  })
})

describe('availability answers', () => {
  const keys = ['canteen', 'bar']
  it('accepts the three answers, a short note and known shifts', () => {
    expect(parseAvailability({ state: 'yes', note: ' can do early ', preferred: ['bar', 'bar'] }, keys)).toEqual({ ok: true, state: 'yes', note: 'can do early', preferred: ['bar'] })
    expect(parseAvailability({ state: 'maybe', note: '', preferred: 'canteen' }, keys)).toEqual({ ok: true, state: 'maybe', note: null, preferred: ['canteen'] })
    expect(parseAvailability({ state: 'no', note: null }, keys)).toMatchObject({ ok: true, state: 'no', preferred: [] })
  })
  it('rejects anything else', () => {
    expect(parseAvailability({ state: 'sure', note: '' }, keys)).toEqual({ ok: false, error: 'state' })
    expect(parseAvailability({ state: 'yes', note: 'x'.repeat(201) }, keys)).toEqual({ ok: false, error: 'note' })
    expect(parseAvailability({ state: 'yes', note: '4111111111111111' }, keys)).toEqual({ ok: false, error: 'note' })
    expect(parseAvailability({ state: 'yes', note: '', preferred: ['nope'] }, keys)).toEqual({ ok: false, error: 'shifts' })
  })
})

const shifts: ShiftRow[] = [
  { id: 1, weekId: 1, shiftTypeKey: 'canteen', labelSnapshot: 'Canteen', hours: 3, slots: 2 },
  { id: 2, weekId: 1, shiftTypeKey: 'bar', labelSnapshot: 'Bar', hours: 4, slots: 1 },
]
const as = (id: number, shiftId: number, memberId: number, state: AssignmentRow['state'] = 'rostered', kind: AssignmentRow['kind'] = 'volunteer'): AssignmentRow => ({ id, shiftId, memberId, kind, hours: shiftId === 1 ? 3 : 4, state })

describe('roster fill and warnings', () => {
  it('counts only rostered and confirmed, and an over-full shift does not hide an empty one', () => {
    expect(fillStatus(shifts, [as(1, 1, 10), as(2, 1, 11, 'cancelled')])).toEqual({ slots: 3, filled: 1, empty: 2 })
    expect(fillStatus(shifts, [as(1, 1, 10), as(2, 1, 11), as(3, 1, 12)])).toEqual({ slots: 3, filled: 2, empty: 1 })
    expect(fillStatus([], [])).toEqual({ slots: 0, filled: 0, empty: 0 })
  })
  it('warns about double booking, over capacity and someone who said no', () => {
    const w = rosterWarnings(shifts, [as(1, 1, 10), as(2, 2, 10), as(3, 1, 11), as(4, 1, 12), as(5, 2, 13, 'cancelled')], new Map([[11, 'no' as const], [12, 'yes' as const]]))
    expect(w).toEqual(
      expect.arrayContaining([
        { kind: 'over-capacity', shiftId: 1, memberId: null },
        { kind: 'double-booked', shiftId: null, memberId: 10 },
        { kind: 'said-no', shiftId: 1, memberId: 11 },
      ]),
    )
    expect(w).toHaveLength(3)
  })
  it('ranks yes before maybe before no answer before no, then lighter load, then name', () => {
    const people = [{ id: 1, name: 'Zed' }, { id: 2, name: 'Amy' }, { id: 3, name: 'Bob' }, { id: 4, name: 'Cat' }, { id: 5, name: 'Dan' }]
    const answers = new Map([[1, { state: 'yes' as const, preferred: [] as string[] }], [2, { state: 'yes' as const, preferred: [] as string[] }], [3, { state: 'no' as const, preferred: [] as string[] }], [4, { state: 'maybe' as const, preferred: [] as string[] }]])
    const r = rankCandidates(people, answers, new Map([[1, 0], [2, 3]]), 'bar')
    expect(r.map((c) => c.name)).toEqual(['Zed', 'Amy', 'Cat', 'Dan', 'Bob'])
    expect(r[0]).toMatchObject({ answer: 'yes', load: 0 })
  })
  it('puts a preferred shift type first within an answer', () => {
    const answers = new Map([[1, { state: 'yes' as const, preferred: [] as string[] }], [2, { state: 'yes' as const, preferred: ['bar'] }]])
    expect(rankCandidates([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], answers, new Map(), 'bar').map((c) => c.id)).toEqual([2, 1])
  })
})

describe('confirming a week', () => {
  it('posts one row per rostered or confirmed assignment, none for no-shows and cancellations', () => {
    const list = [as(1, 1, 10), as(2, 1, 11, 'confirmed'), as(3, 2, 12, 'no-show'), as(4, 2, 13, 'cancelled'), as(5, 2, 14, 'rostered', 'paid')]
    const { post, becomeConfirmed } = planConfirm('2026-10-17', shifts, list, new Set())
    expect(post.map((p) => p.assignmentId)).toEqual([1, 2, 5])
    expect(post[2]).toMatchObject({ memberId: 14, hours: 4, kind: 'paid', shiftTypeKey: 'bar', date: '2026-10-17' })
    expect(becomeConfirmed).toEqual([1, 5])
  })
  it('is idempotent: assignments that already have a live row add nothing', () => {
    const list = [as(1, 1, 10), as(2, 1, 11)]
    const first = planConfirm('2026-10-17', shifts, list, new Set())
    const second = planConfirm('2026-10-17', shifts, list, new Set(first.post.map((p) => p.assignmentId)))
    expect(first.post).toHaveLength(2)
    expect(second.post).toEqual([])
  })
  it('reopening sends confirmed assignments back to rostered and leaves no-shows', () => {
    expect(planReopen([as(1, 1, 10, 'confirmed'), as(2, 1, 11, 'no-show'), as(3, 1, 12, 'rostered')]).backToRostered).toEqual([1])
  })
})

const round2 = (n: number): number => Math.round(n * 100) / 100
const h = (memberId: number, hours: number, kind: HoursRow['kind'] = 'volunteer', shiftTypeKey = 'canteen', date = '2026-10-17'): HoursRow => ({ memberId, hours, kind, shiftTypeKey, date })

describe('the small-count rule', () => {
  it('shows a cell only when at least three different people are in it', () => {
    const t = smallCountTable([h(1, 3), h(2, 3), h(3, 3), h(1, 2, 'volunteer', 'bar'), h(2, 2, 'volunteer', 'bar')], (r) => r.shiftTypeKey)
    expect(t.cells.map((c) => c.key)).toEqual(['canteen'])
    // The two-person "bar" cell is merged into other; with only two people the merged row is itself too small.
    expect(t.other).toEqual({ hours: null, people: null })
    expect(t.totalHours).toBeNull()
  })
  it('does not count the same person twice', () => {
    const t = smallCountTable([h(1, 3), h(1, 3), h(1, 3)], (r) => r.shiftTypeKey)
    expect(t.cells).toEqual([])
    expect(t.totalHours).toBeNull()
  })
  it('a single suppressed cell is not recoverable: its merged row and the total are both withheld', () => {
    const rows = [h(1, 3), h(2, 3), h(3, 3), h(4, 5, 'volunteer', 'gate')]
    const t = smallCountTable(rows, (r) => r.shiftTypeKey)
    expect(t.other).toEqual({ hours: null, people: null })
    expect(t.totalHours).toBeNull()
  })
  it('small cells that together cover three people merge into a shown other row', () => {
    const rows = [h(1, 3), h(2, 3), h(3, 3), h(4, 1, 'volunteer', 'gate'), h(5, 1, 'volunteer', 'bar'), h(6, 1, 'volunteer', 'scorer')]
    const t = smallCountTable(rows, (r) => r.shiftTypeKey)
    expect(t.other).toEqual({ hours: 3, people: 3 })
    expect(t.totalHours).toBe(12)
  })
  it('shows everything when every cell is big enough', () => {
    const t = smallCountTable([h(1, 2), h(2, 2), h(3, 2)], (r) => r.shiftTypeKey)
    expect(t).toEqual({ cells: [{ key: 'canteen', hours: 6, people: 3 }], other: null, totalHours: 6 })
  })
  it('an empty table is zero, nothing to identify', () => {
    expect(smallCountTable([], (r) => r.shiftTypeKey)).toEqual({ cells: [], other: null, totalHours: 0 })
  })
})

describe('the name-free aggregate keeps paid and volunteer apart', () => {
  const vol = [h(1, 3), h(2, 3), h(3, 3), h(4, 3, 'volunteer', 'bar'), h(5, 3, 'volunteer', 'bar'), h(6, 3, 'volunteer', 'bar')]
  it('reports a kind with enough people, says none for an empty kind', () => {
    const [v, p] = aggregateHours(vol)
    expect(v).toMatchObject({ kind: 'volunteer', state: 'shown', people: 6, hours: 18 })
    expect(p).toEqual({ kind: 'paid', state: 'none' })
  })
  it('hides a paid kind with fewer than three people altogether, so no figure includes it', () => {
    const [v, p] = aggregateHours([...vol, h(7, 6, 'paid', 'bar'), h(8, 6, 'paid', 'bar')])
    expect(p).toEqual({ kind: 'paid', state: 'hidden' })
    expect(JSON.stringify(v)).not.toContain('"hours":12')
    expect(v).toMatchObject({ state: 'shown', hours: 18 })
  })
  it('withholds the headline when a breakdown has a hidden other', () => {
    const rows = [h(1, 3), h(2, 3), h(3, 3), h(1, 2, 'volunteer', 'gate')]
    const [v] = aggregateHours(rows)
    expect(v).toMatchObject({ state: 'shown', people: 3, hours: null })
  })
  it('never shows two breakdowns that add up to the same total when one of them hides a group', () => {
    // Three people in the canteen in one month, and one person on the gate the same month: by month is complete, by job hides the gate.
    const rows = [h(1, 3), h(2, 3), h(3, 3), h(4, 4, 'volunteer', 'gate')]
    const [v] = aggregateHours(rows)
    if (v.state !== 'shown') throw new Error('expected a shown summary')
    expect(v.hours).toBeNull()
    expect(v.byMonth).toBeNull() // would sum to 13 and give the gate away
    expect(v.byType).not.toBeNull()
    expect(v.byType!.totalHours).toBeNull()
    expect(v.byType!.other).toEqual({ hours: null, people: null })
    // And the other way round: the month is the small one, the job table is the complete one.
    const [w] = aggregateHours([h(1, 3, 'volunteer', 'canteen', '2026-03-07'), h(2, 3, 'volunteer', 'canteen', '2026-03-07'), h(3, 3, 'volunteer', 'canteen', '2026-03-07'), h(4, 5, 'volunteer', 'canteen', '2026-04-04')])
    if (w.state !== 'shown') throw new Error('expected a shown summary')
    expect(w.byType).toBeNull()
    expect(w.byMonth).not.toBeNull()
    expect(w.byMonth!.totalHours).toBeNull()
  })
  it('whatever is shown, no table adds up to the true total while a group is hidden', () => {
    const cases: HoursRow[][] = [
      [h(1, 3), h(2, 3), h(3, 3), h(4, 4, 'volunteer', 'gate')],
      [h(1, 3), h(2, 3), h(3, 3), h(1, 2, 'volunteer', 'gate'), h(2, 1, 'volunteer', 'bar', '2026-11-07')],
      [h(1, 3), h(2, 3), h(3, 3), h(4, 1, 'volunteer', 'gate'), h(5, 1, 'volunteer', 'bar'), h(6, 1, 'volunteer', 'scorer')],
    ]
    for (const rows of cases) {
      const truth = round2(rows.reduce((s, r) => s + r.hours, 0))
      const [v] = aggregateHours(rows)
      if (v.state !== 'shown') continue
      const tables = [v.byType, v.byMonth].filter((t): t is NonNullable<typeof t> => t !== null)
      const hiddenSomewhere = tables.some((t) => t.other && t.other.hours === null)
      if (!hiddenSomewhere) continue
      expect(v.hours).toBeNull()
      for (const t of tables) {
        const shown = t.cells.reduce((s, c) => s + c.hours, 0) + (t.other?.hours ?? 0)
        expect(round2(shown), JSON.stringify(rows)).not.toBe(truth)
      }
    }
  })
  it('per-person totals split paid and volunteer for admins', () => {
    expect(hoursByPerson([h(1, 3), h(1, 2.5, 'paid'), h(2, 1)]).find((r) => r.memberId === 1)).toEqual({ memberId: 1, volunteer: 3, paid: 2.5 })
  })
})

describe('manual hours', () => {
  const base = { memberId: '5', date: '2026-10-10', hours: '2.5', kind: 'volunteer', shiftTypeKey: 'canteen', note: 'Working bee' }
  it('accepts a sensible entry', () => {
    expect(validateManualHours(base, ['canteen'], '2026-10-12')).toMatchObject({ ok: true, memberId: 5, hours: 2.5, kind: 'volunteer' })
    expect(validateManualHours({ ...base, shiftTypeKey: '' }, ['canteen'], '2026-10-12')).toMatchObject({ ok: true, shiftTypeKey: null })
  })
  it('rejects the rest', () => {
    expect(validateManualHours({ ...base, memberId: 'x' }, [], '2026-10-12')).toEqual({ ok: false, error: 'member' })
    expect(validateManualHours({ ...base, date: '2026-10-13' }, [], '2026-10-12')).toEqual({ ok: false, error: 'date' })
    expect(validateManualHours({ ...base, hours: '0' }, [], '2026-10-12')).toEqual({ ok: false, error: 'hours' })
    expect(validateManualHours({ ...base, hours: '25' }, [], '2026-10-12')).toEqual({ ok: false, error: 'hours' })
    expect(validateManualHours({ ...base, kind: 'wages' }, [], '2026-10-12')).toEqual({ ok: false, error: 'kind' })
    expect(validateManualHours(base, [], '2026-10-12')).toEqual({ ok: false, error: 'shift' })
    expect(validateManualHours({ ...base, note: '4111111111111111' }, ['canteen'], '2026-10-12')).toEqual({ ok: false, error: 'note' })
  })
})

describe('honest wording on the volunteer lines', () => {
  it('the landing line says what it leaves out, for none, one and many', async () => {
    const { officeCopy } = await import('../payload/admin/copy')
    const v = officeCopy.volunteers
    expect(v.stat(null, 0, 0)).toBe('No volunteer weeks set up yet')
    expect(v.stat('Sat 17 Oct', 0, 0)).toBe('No jobs set up yet for Sat 17 Oct')
    expect(v.stat('Sat 17 Oct', 1, 1)).toBe('1 of 1 volunteer place is empty for Sat 17 Oct (cancelled and no-show people are not counted)')
    expect(v.stat('Sat 17 Oct', 4, 6)).toBe('4 of 6 volunteer places are empty for Sat 17 Oct (cancelled and no-show people are not counted)')
  })
  it('the notification names the day and what is not counted', async () => {
    const { officeCopy } = await import('../payload/admin/copy')
    expect(officeCopy.volunteers.notification(1, 'Sat 17 Oct')).toBe('1 volunteer place is still empty for Sat 17 Oct (cancelled and no-show people are not counted)')
    expect(officeCopy.volunteers.notification(3, 'Sat 17 Oct')).toContain('3 volunteer places are still empty')
  })
  it('the report states its exclusions, and warnings read as sentences', async () => {
    const { officeCopy } = await import('../payload/admin/copy')
    expect(officeCopy.volunteers.excludes).toMatch(/Voided entries.*did not turn up.*not confirmed.*fewer than 3/)
    expect(officeCopy.volunteers.warning({ kind: 'double-booked' }, 'Ann', '')).toBe('Ann is on more than one job this day.')
    expect(officeCopy.volunteers.warning({ kind: 'over-capacity' }, '', 'Bar')).toBe('Bar has more people than it needs.')
    expect(officeCopy.volunteers.warning({ kind: 'said-no' }, 'Ben', '')).toBe('Ben said they cannot do this day.')
  })
  it('only the committee is told about empty places, and a full roster says nothing', async () => {
    const { notificationLines } = await import('../lib/admin/notifications')
    const base = { latestRun: null, pending: { stories: 0, photos: 0 }, duplicateCount: null, imports: null }
    const o = { isAdmin: false, adminRoute: '/admin', now: new Date(), formatDate: () => '' }
    const withEmpty = notificationLines({ ...base, volunteers: { empty: 2, text: '2 volunteer places are still empty for Sat 17 Oct' } }, o)
    expect(withEmpty.map((l) => l.key)).toContain('volunteers-empty')
    expect(notificationLines({ ...base, volunteers: { empty: 0, text: '' } }, o).map((l) => l.key)).not.toContain('volunteers-empty')
    expect(notificationLines({ ...base, volunteers: null }, o).map((l) => l.key)).not.toContain('volunteers-empty')
  })
})
