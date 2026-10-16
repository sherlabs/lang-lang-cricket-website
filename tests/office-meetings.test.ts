import { describe, expect, it } from 'vitest'
import {
  actionStanding,
  buildMinutes,
  buildRestrictedAnnex,
  dateAsNumber,
  decideOfficeBearer,
  defaultMeetingRestricted,
  effectiveRestricted,
  itemsFromTemplate,
  planHandover,
  restrictedLine,
  safeFileName,
  validateActionInput,
  validateDocument,
  validateMotion,
  validateNewMeeting,
  type MinutesInput,
  type SeatRow,
} from '../lib/office/meetings'
import { STARTER_TEMPLATES } from '../lib/office/starter-meetings'
import { isOfficeBearer, officeBearerLookups } from '../lib/office/office-bearer'
import { officeCopy } from '../payload/admin/copy'
import { notificationLines } from '../lib/admin/notifications'
import { sanitiseSummary } from '../lib/office/audit'

const now = new Date('2026-10-12T00:00:00Z')

describe('itemsFromTemplate', () => {
  it('copies items in order; finance items always start restricted', () => {
    const items = itemsFromTemplate({ kind: 'ordinary', items: [{ title: 'Welcome', kind: 'welcome' }, { title: 'Money', kind: 'financial' }, { title: 'Other', kind: 'general', restricted: true }, { title: 'Notes', kind: 'general', defaultNotes: 'start' }] })
    expect(items.map((i) => [i.order, i.title, i.restricted])).toEqual([[1, 'Welcome', false], [2, 'Money', true], [3, 'Other', true], [4, 'Notes', false]])
    expect(items[3].notes).toBe('start')
  })
  it('every item of a special template starts restricted', () => {
    expect(itemsFromTemplate({ kind: 'special', items: [{ title: 'A', kind: 'general' }, { title: 'B', kind: 'close' }] }).every((i) => i.restricted)).toBe(true)
  })
  it('special meetings default to restricted, others do not; a restricted meeting restricts every item', () => {
    expect(defaultMeetingRestricted('special')).toBe(true)
    expect(defaultMeetingRestricted('ordinary')).toBe(false)
    expect(defaultMeetingRestricted('annual')).toBe(false)
    expect(effectiveRestricted(true, false)).toBe(true)
    expect(effectiveRestricted(false, true)).toBe(true)
    expect(effectiveRestricted(false, false)).toBe(false)
  })
  it('the starter agendas are generic: an annual, an ordinary and a special one, and the finance item is marked', () => {
    expect(STARTER_TEMPLATES.map((t) => t.kind).sort()).toEqual(['annual', 'ordinary', 'special'])
    const annual = STARTER_TEMPLATES.find((t) => t.kind === 'annual')!
    expect(annual.items.some((i) => i.kind === 'financial')).toBe(true)
    expect(annual.items.some((i) => i.kind === 'election')).toBe(true)
  })
})

describe('decideOfficeBearer', () => {
  const seat = (over: Partial<{ holderUserId: number | null; officeBearer: boolean; termEnd: string | null }> = {}) => ({ holderUserId: 7, officeBearer: true, termEnd: null, ...over })
  const editor = { id: 7, role: 'editor' }
  it('admins always qualify; disabled and anonymous never do', () => {
    expect(decideOfficeBearer({ id: 1, role: 'admin' }, [], now)).toBe(true)
    expect(decideOfficeBearer({ id: 1, role: 'admin', disabled: true }, [], now)).toBe(false)
    expect(decideOfficeBearer(null, [seat()], now)).toBe(false)
  })
  it('selectors never qualify, even with a seat', () => {
    expect(decideOfficeBearer({ id: 7, role: 'selector' }, [seat()], now)).toBe(false)
  })
  it('an editor qualifies only through an office-bearer seat that names them', () => {
    expect(decideOfficeBearer(editor, [], now)).toBe(false)
    expect(decideOfficeBearer(editor, [seat()], now)).toBe(true)
    expect(decideOfficeBearer(editor, [seat({ officeBearer: false })], now)).toBe(false)
    expect(decideOfficeBearer(editor, [seat({ holderUserId: 8 })], now)).toBe(false)
    expect(decideOfficeBearer(editor, [seat({ holderUserId: null })], now)).toBe(false)
  })
  it('term end: empty or future counts, past (or exactly now) does not', () => {
    expect(decideOfficeBearer(editor, [seat({ termEnd: null })], now)).toBe(true)
    expect(decideOfficeBearer(editor, [seat({ termEnd: '2026-12-01T00:00:00Z' })], now)).toBe(true)
    expect(decideOfficeBearer(editor, [seat({ termEnd: '2026-10-11T00:00:00Z' })], now)).toBe(false)
    expect(decideOfficeBearer(editor, [seat({ termEnd: now.toISOString() })], now)).toBe(false)
  })
  it('any one qualifying seat is enough', () => {
    expect(decideOfficeBearer(editor, [seat({ termEnd: '2020-01-01T00:00:00Z' }), seat()], now)).toBe(true)
  })
})

describe('isOfficeBearer memoisation', () => {
  const fakeReq = (seats: unknown[]) => {
    let calls = 0
    const req = { payload: { find: async () => (calls++, { docs: seats }) } }
    return { req: req as never, calls: () => calls }
  }
  it('looks the seats up once for many calls in one request, and again for a new request', async () => {
    const seats = [{ holderUser: 7, officeBearer: true, termEnd: null }]
    const a = fakeReq(seats)
    const user = { id: 7, role: 'editor' }
    const before = officeBearerLookups.count
    const answers = await Promise.all([isOfficeBearer(user, a.req), isOfficeBearer(user, a.req), isOfficeBearer(user, a.req)])
    expect(answers).toEqual([true, true, true])
    await isOfficeBearer(user, a.req)
    expect(a.calls()).toBe(1)
    expect(officeBearerLookups.count - before).toBe(1)
    const b = fakeReq([])
    expect(await isOfficeBearer(user, b.req)).toBe(false)
    expect(b.calls()).toBe(1)
  })
  it('does not look anything up for admins, selectors or anonymous callers, and fails closed on an error', async () => {
    const a = fakeReq([])
    expect(await isOfficeBearer({ id: 1, role: 'admin' }, a.req)).toBe(true)
    expect(await isOfficeBearer({ id: 2, role: 'selector' }, a.req)).toBe(false)
    expect(await isOfficeBearer(null, a.req)).toBe(false)
    expect(a.calls()).toBe(0)
    const broken = { payload: { find: async () => { throw new Error('db down') } } } as never
    expect(await isOfficeBearer({ id: 7, role: 'editor' }, broken)).toBe(false)
  })
})

describe('planHandover', () => {
  it('treats a vacant seat that still has a login as changed, so the old login is cleared', () => {
    const ops = planHandover([{ id: 9, title: 'Vice', holderPersonId: null, holderUserId: 77 }], [{ seatId: 9, newPersonId: null, loginUserId: null }], '2026-10-20')
    expect(ops).toHaveLength(1)
    expect(ops[0].set.holderUser).toBeNull()
  })
  const seats: SeatRow[] = [
    { id: 1, title: 'President', holderPersonId: 10, holderUserId: 100 },
    { id: 2, title: 'Secretary', holderPersonId: 11, holderUserId: 101 },
    { id: 3, title: 'Treasurer', holderPersonId: 12, holderUserId: null },
    { id: 4, title: 'Coach liaison', holderPersonId: null, holderUserId: null },
  ]
  it('an unchanged seat is untouched, even if a login is offered', () => {
    expect(planHandover(seats, [{ seatId: 1, newPersonId: 10, loginUserId: 555 }], '2026-10-20')).toEqual([])
  })
  it('a changed seat clears the old login and sets a new one only when picked', () => {
    const ops = planHandover(seats, [{ seatId: 1, newPersonId: 20, loginUserId: null }, { seatId: 2, newPersonId: 21, loginUserId: 301 }], '2026-10-20')
    expect(ops).toHaveLength(2)
    expect(ops[0]).toMatchObject({ seatId: 1, fromPersonId: 10, toPersonId: 20, set: { holder: 20, holderUser: null, termStart: '2026-10-20', termEnd: null } })
    expect(ops[1].set.holderUser).toBe(301)
  })
  it('a vacant seat closes the term and has no login', () => {
    const [op] = planHandover(seats, [{ seatId: 2, newPersonId: null, loginUserId: 301 }], '2026-10-20')
    expect(op.set).toEqual({ holder: null, holderUser: null, termStart: null, termEnd: '2026-10-20' })
    expect(op.toPersonId).toBeNull()
  })
  it('filling a vacant seat starts a term; unknown and repeated seats are ignored; seats not listed are untouched', () => {
    const ops = planHandover(seats, [{ seatId: 4, newPersonId: 30, loginUserId: null }, { seatId: 4, newPersonId: 31, loginUserId: null }, { seatId: 99, newPersonId: 1, loginUserId: null }], '2026-10-20')
    expect(ops.map((o) => [o.seatId, o.set.holder])).toEqual([[4, 30]])
  })
  it('the audit date is a plain number', () => {
    expect(dateAsNumber('2026-10-20')).toBe(20261020)
    expect(sanitiseSummary({ seat: 1, from: 2, to: 3, meeting: 4, date: dateAsNumber('2026-10-20'), name: 'Sam' }, { seat: 'number', from: 'number', to: 'number', meeting: 'number', date: 'number' })).toEqual({ seat: 1, from: 2, to: 3, meeting: 4, date: 20261020 })
  })
})

describe('buildMinutes', () => {
  const input: MinutesInput = {
    title: 'Committee meeting',
    when: 'Tue 20 Oct 2026, 7:00 pm',
    venue: 'Clubrooms',
    chair: 'President (Sam)',
    minuteTaker: 'Secretary (Alex)',
    attendance: [
      { name: 'Sam', state: 'present' },
      { name: 'Alex', state: 'present' },
      { name: 'Kim', state: 'apology' },
      { name: 'Lee', state: 'absent' },
    ],
    items: [
      { order: 1, title: 'Welcome', notes: null, outcome: null, restricted: false, motions: [], actions: [] },
      {
        order: 2,
        title: 'Business',
        notes: 'Discussed the roof.',
        outcome: 'Quotes to be gathered.',
        restricted: false,
        motions: [{ text: 'That we buy a mower.', votesFor: 5, votesAgainst: 1, abstain: 0, result: 'carried', restricted: false }],
        actions: [{ text: 'Get two quotes', owner: 'Secretary (Alex)', due: 'Fri 30 Oct', restricted: false }],
      },
      { order: 3, title: 'Finance', notes: 'Overdraft discussed.', outcome: null, restricted: true, motions: [{ text: 'Pay the bill', votesFor: 6, votesAgainst: 0, abstain: 0, result: 'carried', restricted: true }], actions: [{ text: 'Pay it', owner: null, due: null, restricted: true }] },
    ],
  }
  it('golden output with restricted items left out for a non-office-bearer', () => {
    expect(buildMinutes(input, { includeRestricted: false })).toBe(
      [
        'Committee meeting',
        'Tue 20 Oct 2026, 7:00 pm, Clubrooms',
        'Chair: President (Sam)',
        'Minutes: Secretary (Alex)',
        '',
        'Present (2): Sam, Alex',
        'Apologies (1): Kim',
        'Absent (1): Lee',
        '',
        '1. Welcome',
        '',
        '2. Business',
        'Discussed the roof.',
        'Motion: That we buy a mower. (for 5, against 1, abstain 0). Carried.',
        'Outcome: Quotes to be gathered.',
        'Action: Get two quotes (Secretary (Alex), due Fri 30 Oct)',
        '',
        '1 restricted item is not shown.',
      ].join('\n'),
    )
  })
  it('an office-bearer copy includes the restricted item, and the annex holds only restricted items', () => {
    const full = buildMinutes(input, { includeRestricted: true })
    expect(full).toContain('3. Finance')
    expect(full).toContain('Motion: Pay the bill')
    expect(full).not.toContain('not shown')
    const annex = buildRestrictedAnnex(input.items)
    expect(annex).toContain('3. Finance')
    expect(annex).not.toContain('Welcome')
  })
  it('handles an empty meeting and pluralises the hidden line', () => {
    const empty = buildMinutes({ ...input, attendance: [], items: [], chair: null, minuteTaker: null, venue: null }, { includeRestricted: false })
    expect(empty).toContain('Present (0): none recorded')
    expect(restrictedLine(1)).toBe('1 restricted item is not shown.')
    expect(restrictedLine(3)).toBe('3 restricted items are not shown.')
  })
})

describe('actionStanding', () => {
  const today = '2026-10-12'
  it('derives overdue, blocked, due soon, open, done and dropped', () => {
    expect(actionStanding({ status: 'open', due: '2026-10-11' }, today)).toBe('overdue')
    expect(actionStanding({ status: 'open', due: today }, today)).toBe('due-soon')
    expect(actionStanding({ status: 'open', due: '2026-10-19' }, today)).toBe('due-soon')
    expect(actionStanding({ status: 'open', due: '2026-10-20' }, today)).toBe('open')
    expect(actionStanding({ status: 'open', due: null }, today)).toBe('open')
    expect(actionStanding({ status: 'blocked', due: null }, today)).toBe('blocked')
    expect(actionStanding({ status: 'blocked', due: '2026-10-01' }, today)).toBe('overdue')
    expect(actionStanding({ status: 'done', due: '2020-01-01' }, today)).toBe('done')
    expect(actionStanding({ status: 'dropped', due: '2020-01-01' }, today)).toBe('dropped')
  })
})

describe('validators', () => {
  it('new meeting: needs a template and a real date; the time defaults and is checked; venue and title are bounded', () => {
    expect(validateNewMeeting({ templateId: '3', date: '2026-10-20', time: '', title: '', venue: '' })).toEqual({ ok: true, value: { templateId: 3, startsAt: '2026-10-20T19:00:00.000Z', title: null, venue: null } })
    expect(validateNewMeeting({ templateId: '', date: '2026-10-20', time: '19:00', title: '', venue: '' })).toEqual({ ok: false, code: 'template' })
    expect(validateNewMeeting({ templateId: '3', date: '2026-02-31', time: '19:00', title: '', venue: '' })).toEqual({ ok: false, code: 'date' })
    expect(validateNewMeeting({ templateId: '3', date: '2026-10-20', time: '25:00', title: '', venue: '' })).toEqual({ ok: false, code: 'time' })
    expect(validateNewMeeting({ templateId: '3', date: '2026-10-20', time: '08:30', title: 'x'.repeat(200), venue: '' })).toEqual({ ok: false, code: 'title' })
  })
  it('motion: counts are whole numbers or empty, the result is one of the list, and no card numbers', () => {
    expect(validateMotion({ text: 'Buy a mower', votesFor: '5', votesAgainst: '', abstain: undefined, result: 'carried' })).toEqual({ ok: true, value: { text: 'Buy a mower', votesFor: 5, votesAgainst: null, abstain: null, result: 'carried' } })
    expect(validateMotion({ text: '', votesFor: '', votesAgainst: '', abstain: '', result: '' })).toEqual({ ok: false, code: 'text' })
    expect(validateMotion({ text: 'x', votesFor: '-1', votesAgainst: '', abstain: '', result: '' })).toEqual({ ok: false, code: 'count' })
    expect(validateMotion({ text: 'x', votesFor: '1.5', votesAgainst: '', abstain: '', result: '' })).toEqual({ ok: false, code: 'count' })
    expect(validateMotion({ text: 'x', votesFor: '', votesAgainst: '', abstain: '', result: 'maybe' })).toEqual({ ok: false, code: 'result' })
    expect(validateMotion({ text: 'pay with 4111 1111 1111 1111', votesFor: '', votesAgainst: '', abstain: '', result: '' })).toEqual({ ok: false, code: 'text' })
  })
  it('action: text required, ids positive, due a real date', () => {
    expect(validateActionInput({ text: 'Get quotes', ownerSeat: '4', ownerPerson: '', due: '2026-11-01' })).toEqual({ ok: true, value: { text: 'Get quotes', ownerSeat: 4, ownerPerson: null, due: '2026-11-01' } })
    expect(validateActionInput({ text: 'Get quotes', ownerSeat: '0', ownerPerson: '', due: '' })).toEqual({ ok: false, code: 'person' })
    expect(validateActionInput({ text: 'Get quotes', ownerSeat: '', ownerPerson: '', due: 'soon' })).toEqual({ ok: false, code: 'date' })
  })
  it('document: title and category, meeting optional; file names are made safe', () => {
    expect(validateDocument({ title: 'Insurance 2026', category: 'insurance', meetingId: '' })).toEqual({ ok: true, value: { title: 'Insurance 2026', category: 'insurance', meetingId: null } })
    expect(validateDocument({ title: 'x', category: 'secrets', meetingId: '' })).toEqual({ ok: false, code: 'category' })
    expect(safeFileName('../../etc/pass"wd<script>.pdf')).toBe('.._.._etc_pass_wd_script_.pdf')
    expect(safeFileName('')).toBe('file')
  })
})

describe('wording', () => {
  it('overdue and blocked lines say what they leave out, for zero, one and many', () => {
    expect(officeCopy.meetings.overdue(1)).toBe('1 committee action is overdue (done and dropped actions are not counted; restricted actions only for office-bearers)')
    expect(officeCopy.meetings.overdue(4)).toMatch(/^4 committee actions are overdue .*done and dropped/)
    expect(officeCopy.meetings.blocked(2)).toMatch(/^2 committee actions are blocked .*restricted actions only for office-bearers/)
    expect(officeCopy.meetings.stat(null, 0)).toBe('No meeting planned; no committee actions are overdue (done and dropped actions are not counted; restricted actions only for office-bearers)')
    expect(officeCopy.meetings.stat('Tue 20 Oct', 1)).toMatch(/^Next meeting Tue 20 Oct; 1 committee action is overdue/)
    expect(officeCopy.meetings.hiddenItems(1)).toBe('1 restricted item is only visible to office-bearers.')
    expect(officeCopy.meetings.hiddenMeetings(2)).toBe('2 restricted meetings are only visible to office-bearers.')
  })
  it('the notification centre shows the lines only when the count is above zero, problems first', () => {
    const base = { latestRun: null, pending: { stories: 0, photos: 0 }, duplicateCount: null, imports: null }
    const o = { isAdmin: false, adminRoute: '/admin', now, formatDate: () => '' }
    expect(notificationLines({ ...base, meetings: { overdue: 0, blocked: 0, overdueText: 'o', blockedText: 'b' } }, o).map((l) => l.key)).toEqual([])
    const lines = notificationLines({ ...base, meetings: { overdue: 2, blocked: 1, overdueText: officeCopy.meetings.overdue(2), blockedText: officeCopy.meetings.blocked(1) } }, o)
    expect(lines.map((l) => l.key)).toEqual(['actions-overdue', 'actions-blocked'])
    expect(lines[0].href).toBe('/admin/office/meetings/actions')
  })
})
