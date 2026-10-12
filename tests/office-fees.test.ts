import { describe, expect, it } from 'vitest'
import { validatePayment, validateWaiver } from '../lib/office/fee-input'
import { chargesToStore, feeReport, ledgerFor, owingSummary, previewPayment, type FeeModel } from '../lib/office/fee-report'
import { allHouseholds, allocate, deriveCharges, householdFor, type Charge, type Payment, type Waiver } from '../lib/office/fees'
import { formatMoney, parseMoney, parseRate, splitEvenly } from '../lib/office/money'
import { currentSeason, seasonRange, seasonStartYearOfName } from '../lib/office/season'

const game = (n: number, season = '2026/27', amount = 1000, date = `2026-10-${String(n).padStart(2, '0')}`): Charge => ({ id: `game:m${n}`, kind: 'game', date, season, amountCents: amount, matchId: `m${n}`, description: `Round ${n}` })
const pay = (id: string, amountCents: number, receivedOn = '2026-11-01', appliesTo: Payment['appliesTo'] = null): Payment => ({ id, amountCents, receivedOn, appliesTo })
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('money', () => {
  it('parses what people type into cents and refuses the rest', () => {
    expect(parseMoney('20')).toBe(2000)
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('$ 12.50')).toBe(1250)
    expect(parseMoney('1,250.00')).toBe(125000)
    for (const bad of ['', '0', '-5', '1.234', 'abc', '1e3', '99999999999', null, undefined, 12]) expect(parseMoney(bad), String(bad)).toBeNull()
    expect(parseRate('0')).toBe(0)
    expect(parseRate('')).toBe(0)
    expect(parseRate('15')).toBe(1500)
  })
  it('formats in the club currency and splits to the cent', () => {
    expect(formatMoney(1250, { currency: 'AUD', locale: 'en-AU' })).toContain('12.50')
    expect(formatMoney(1250, { currency: 'NOPE', locale: 'en-AU' })).toContain('12.50')
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333])
    expect(sum(splitEvenly(1001, 4))).toBe(1001)
  })
})

describe('seasons', () => {
  it('names and ranges follow the club rules', () => {
    expect(currentSeason('2026-10-12').name).toBe('2026/27')
    expect(currentSeason('2027-02-01').name).toBe('2026/27')
    expect(seasonStartYearOfName('2026/27')).toBe(2026)
    expect(seasonRange('2026/27')).toMatchObject({ from: '2026-07-01', to: '2027-06-30' })
    expect(seasonRange('nope')).toBeNull()
  })
  it('rejects names that are not a season of the configured format', () => {
    for (const bad of ['2026', '2026/99', '2026/28', '1999x', '26/27']) expect(seasonStartYearOfName(bad, { startMonth: 7, format: 'split' }), bad).toBeNull()
    expect(seasonStartYearOfName('2026/27', { startMonth: 7, format: 'split' })).toBe(2026)
    expect(seasonStartYearOfName('2099/00', { startMonth: 7, format: 'split' })).toBe(2099)
    expect(seasonStartYearOfName('2026', { startMonth: 7, format: 'single' })).toBe(2026)
    expect(seasonStartYearOfName('2026/27', { startMonth: 7, format: 'single' })).toBeNull()
  })
  it('same-day ids settle in numeric order', () => {
    const c = (id: string) => ({ id, kind: 'game' as const, date: '2026-08-01', season: '2026/27', amountCents: 1000, description: id, matchId: id })
    const a = allocate([c('100'), c('99')], [], [pay('p1', 1000)])
    expect(a.lines.map((l) => [l.id, l.status])).toEqual([['99', 'paid'], ['100', 'owing']])
  })
})

describe('allocate: worked examples', () => {
  it('three games and a part payment settle the oldest first', () => {
    const a = allocate([game(1), game(2), game(3)], [], [pay('p1', 1500)])
    expect(a.lines.map((l) => l.status)).toEqual(['paid', 'part-paid', 'owing'])
    expect(a.lines.map((l) => l.owedCents)).toEqual([0, 500, 1000])
    expect(a.creditCents).toBe(0)
  })
  it('a waiver then a payment: the waived game is skipped', () => {
    const w: Waiver = { id: 'w1', scope: 'game', matchId: 'm1' }
    const a = allocate([game(1), game(2)], [w], [pay('p1', 1000)])
    expect(a.lines.map((l) => l.status)).toEqual(['waived', 'paid'])
    expect(a.creditCents).toBe(0)
  })
  it('an amount waiver reduces the oldest charges first; a season waiver zeroes the season', () => {
    const a = allocate([game(1), game(2)], [{ id: 'w1', scope: 'amount', amountCents: 1500 }], [])
    expect(a.lines.map((l) => l.payableCents)).toEqual([0, 500])
    const b = allocate([game(1), game(2, '2027/28', 1000, '2027-10-01')], [{ id: 'w2', scope: 'season', season: '2026/27' }], [])
    expect(b.lines.map((l) => l.status)).toEqual(['waived', 'owing'])
  })
  it('an overpayment becomes credit and rolls into a later season', () => {
    const first = allocate([game(1)], [], [pay('p1', 3000)])
    expect(first.creditCents).toBe(2000)
    const later = allocate([game(1), game(1, '2027/28', 1000, '2027-10-02'), { ...game(2, '2027/28', 1500, '2027-10-09'), id: 'game:x2', matchId: 'x2' }], [], [pay('p1', 3000)])
    expect(later.lines.every((l) => l.owedCents === 0)).toBe(true)
    expect(later.creditCents).toBe(500)
  })
  it('a 2027 targeted payment while 2026 is owing leaves 2026 owing and 2027 paid', () => {
    const season26 = game(1, '2026/27', 4000)
    const season27: Charge = { id: 'season:2027/28', kind: 'season', date: '2027-07-10', season: '2027/28', amountCents: 5000, description: 'Membership 2027/28' }
    const a = allocate([season26, season27], [], [pay('p1', 5000, '2027-07-11', { kind: 'season', season: '2027/28' })])
    expect(a.lines.find((l) => l.season === '2026/27')!.status).toBe('owing')
    expect(a.lines.find((l) => l.season === '2027/28')!.status).toBe('paid')
    expect(a.lines.find((l) => l.season === '2027/28')!.paidTargetedCents).toBe(5000)
    expect(a.creditCents).toBe(0)
  })
  it('the excess of a targeted payment is held as credit, never spent on older debt', () => {
    const old = game(1, '2026/27', 4000)
    const mem: Charge = { id: 'season:2027/28', kind: 'season', date: '2027-07-10', season: '2027/28', amountCents: 5000, description: 'Membership' }
    const a = allocate([old, mem], [], [pay('p1', 7000, '2027-07-11', { kind: 'season', season: '2027/28' })])
    expect(a.lines.find((l) => l.id === old.id)!.owedCents).toBe(4000)
    expect(a.creditCents).toBe(2000)
  })
  it('an untargeted payment goes to the oldest debt across seasons', () => {
    const old = game(1, '2026/27', 4000)
    const mem: Charge = { id: 'season:2027/28', kind: 'season', date: '2027-07-10', season: '2027/28', amountCents: 5000, description: 'Membership' }
    const a = allocate([mem, old], [], [pay('p1', 4000, '2027-07-11')])
    expect(a.lines[0].id).toBe(old.id)
    expect(a.lines[0].status).toBe('paid')
    expect(a.lines[1].status).toBe('owing')
  })
  it('a payment aimed at one game settles only that game', () => {
    const a = allocate([game(1), game(2)], [], [pay('p1', 1000, '2026-11-01', { kind: 'charge', matchId: 'm2' })])
    expect(a.lines.map((l) => l.status)).toEqual(['owing', 'paid'])
  })
  it('a voided payment counts for nothing', () => {
    const a = allocate([game(1)], [], [{ ...pay('p1', 1000), voided: true }])
    expect(a.lines[0].status).toBe('owing')
    expect(a.creditCents).toBe(0)
  })
  it('a charge of nothing is not shown and a free tier derives nothing', () => {
    expect(allocate([{ ...game(1), amountCents: 0 }], [], []).lines).toEqual([])
    expect(deriveCharges({ season: '2026/27', upfrontCents: 0, perMatchCents: 0 }, '2026-07-01', [{ matchId: 'm1', date: '2026-10-03', label: 'x' }], false)).toEqual([])
  })
})

describe('allocate: invariants', () => {
  const charges = [game(1), game(2, '2026/27', 750), game(3, '2026/27', 1200), { id: 'season:2026/27', kind: 'season', date: '2026-07-05', season: '2026/27', amountCents: 6000, description: 'Membership' } as Charge]
  const payments = [pay('a', 1700, '2026-08-01'), pay('b', 900, '2026-09-01', { kind: 'season', season: '2026/27' }), pay('c', 20000, '2026-12-01'), pay('d', 300, '2026-12-02', { kind: 'charge', matchId: 'm9' })]
  const shuffle = <T,>(xs: T[], seed: number) => xs.map((x, i) => ({ x, k: Math.sin(seed * (i + 1)) })).sort((a, b) => a.k - b.k).map((o) => o.x)

  it('paid plus credit equals the money received, and no charge is over-paid', () => {
    const a = allocate(charges, [], payments)
    expect(sum(a.lines.map((l) => l.paidCents)) + a.creditCents).toBe(a.totalPaymentsCents)
    for (const l of a.lines) {
      expect(l.paidCents).toBeLessThanOrEqual(l.payableCents)
      expect(l.owedCents).toBeGreaterThanOrEqual(0)
    }
  })
  it('does not depend on the order the rows arrive in', () => {
    const base = JSON.stringify(allocate(charges, [], payments))
    for (const seed of [1, 2, 3, 4]) expect(JSON.stringify(allocate(shuffle(charges, seed), [], shuffle(payments, seed)))).toBe(base)
  })
  it('adding a waiver never increases what is owed', () => {
    const owed = (ws: Waiver[]) => sum(allocate(charges, ws, payments.slice(0, 2)).lines.map((l) => l.owedCents))
    const base = owed([])
    expect(owed([{ id: 'w', scope: 'game', matchId: 'm1' }])).toBeLessThanOrEqual(base)
    expect(owed([{ id: 'w', scope: 'amount', amountCents: 500 }])).toBeLessThanOrEqual(base)
    expect(owed([{ id: 'w', scope: 'season', season: '2026/27' }])).toBeLessThanOrEqual(base)
  })
})

describe('deriveCharges', () => {
  const apps = [
    { matchId: 'm1', date: '2026-10-03', label: 'Rd 1 v A' },
    { matchId: 'm2', date: '2026-10-10', label: 'Rd 2 v B', isFillIn: true },
    { matchId: 'm3', date: '2026-10-17', label: 'Rd 3 v C', isFillIn: true, isRegisteredPlayer: true },
    { matchId: 'm1', date: '2026-10-03', label: 'Rd 1 v A' },
  ]
  it('charges one per game, leaves out fill-ins unless registered or the club charges them', () => {
    const m = { season: '2026/27', upfrontCents: 5000, perMatchCents: 1000, joinedOn: '2026-08-02T00:00:00.000Z' }
    expect(deriveCharges(m, '2026-07-01', apps, false).map((c) => c.id)).toEqual(['season:2026/27', 'game:m1', 'game:m3'])
    expect(deriveCharges(m, '2026-07-01', apps, true).map((c) => c.id)).toEqual(['season:2026/27', 'game:m1', 'game:m2', 'game:m3'])
    expect(deriveCharges(m, '2026-07-01', apps, false)[0].date).toBe('2026-08-02')
  })
})

describe('households', () => {
  const g = new Map<number, number[]>([[1, [10]], [2, [10]], [3, [11]]])
  it('connects siblings through a shared guardian', () => {
    expect(householdFor(1, g)).toEqual([1, 2, 10])
    expect(householdFor(10, g)).toEqual([1, 2, 10])
    expect(householdFor(3, g)).toEqual([3, 11])
    expect(householdFor(99, g)).toEqual([99])
    expect(allHouseholds([1, 2, 3, 10, 11, 99], g)).toEqual([[1, 2, 10], [3, 11], [99]])
  })
})

const model = (over: Partial<FeeModel> = {}): FeeModel => ({
  members: [
    { id: 1, name: 'Ann Lee', playerId: 101, status: 'active', erased: false, guardianIds: [] },
    { id: 2, name: 'Bo Kid', playerId: 102, status: 'active', erased: false, guardianIds: [1] },
    { id: 3, name: 'Cy Kid', playerId: null, status: 'active', erased: false, guardianIds: [1] },
    { id: 4, name: 'Dee Gone', playerId: 104, status: 'past', erased: false, guardianIds: [] },
  ],
  memberships: [
    { memberId: 1, season: '2026/27', tierName: 'Pay as you play', upfrontCents: 0, perMatchCents: 1000 },
    { memberId: 2, season: '2026/27', tierName: 'Junior', upfrontCents: 6000, perMatchCents: 0 },
    { memberId: 3, season: '2026/27', tierName: 'Junior', upfrontCents: 6000, perMatchCents: 0 },
    { memberId: 4, season: '2026/27', tierName: 'Pay as you play', upfrontCents: 0, perMatchCents: 1000 },
  ],
  closedSeasons: new Set(),
  stored: [],
  appearances: [
    { playerId: 101, matchId: 'm1', date: '2026-10-03', label: 'Rd 1' },
    { playerId: 101, matchId: 'm2', date: '2026-10-10', label: 'Rd 2' },
    { playerId: 104, matchId: 'm1', date: '2026-10-03', label: 'Rd 1' },
  ],
  payments: [],
  waivers: [],
  chargeFillIns: false,
  unmatchedAppearances: 0,
  missingFromStore: 0,
  ...over,
})

describe('fee report', () => {
  it('totals equal the sum of the rows, households sum their members, archived members are left out', () => {
    const r = feeReport(model(), '2026/27')
    expect(r.rows.map((x) => x.name)).toEqual(['Ann Lee', 'Bo Kid', 'Cy Kid'])
    expect(r.totals.payableCents).toBe(2000 + 6000 + 6000)
    expect(r.totals.owedCents).toBe(sum(r.rows.map((x) => x.owedCents)))
    const h = r.households.find((x) => x.memberIds.includes(1))!
    expect(h.memberIds.sort()).toEqual([1, 2, 3])
    expect(h.owedCents).toBe(r.totals.owedCents)
  })
  it('credit is shown once per member and incomplete data is flagged on the open season only', () => {
    const m = model({ payments: [{ id: 'p', memberId: 1, payerId: 1, amountCents: 5000, receivedOn: '2026-11-01' }], unmatchedAppearances: 2 })
    const r = feeReport(m, '2026/27')
    expect(r.rows.find((x) => x.memberId === 1)!.creditCents).toBe(3000)
    expect(r.incomplete).toBe(true)
    expect(feeReport({ ...m, closedSeasons: new Set(['2026/27']) }, '2026/27').incomplete).toBe(false)
  })
  it('a payment for one child is settled against that child', () => {
    const m = model({ payments: [{ id: 'p', memberId: 2, payerId: 1, amountCents: 6000, receivedOn: '2026-11-01', splitGroup: 'g' }] })
    expect(ledgerFor(m, 2).lines[0].status).toBe('paid')
    expect(ledgerFor(m, 3).lines[0].status).toBe('owing')
  })
  it('preview names what a payment would settle', () => {
    const p = previewPayment(model(), 1, { id: 'new', amountCents: 1500, receivedOn: '2026-11-01' })
    expect(p.settles.map((s) => [s.description, s.addedCents])).toEqual([['Rd 1', 1000], ['Rd 2', 500]])
    expect(p.creditAfter).toBe(0)
  })
  it('owing summary counts members once', () => {
    expect(owingSummary(model(), ['2026/27'])).toEqual({ members: 3, owedCents: 14000 })
  })
})

describe('closing a season', () => {
  it('stores one charge per derived charge and a closed season ignores later appearance changes', () => {
    const open = model()
    const toStore = chargesToStore(open, '2026/27')
    expect(toStore.length).toBe(2 + 1 + 1 + 1) // Ann two games, Bo and Cy membership, Dee one game
    const stored = toStore.map((s) => ({ ...s.charge, memberId: s.memberId, id: `row${s.charge.id}` }))
    const closed = model({ closedSeasons: new Set(['2026/27']), stored })
    const before = feeReport(closed, '2026/27').totals.payableCents
    // A re-sync adds a game: the closed figure does not move, and the report says match data now gives more.
    const changed = { ...closed, appearances: [...closed.appearances, { playerId: 101, matchId: 'm9', date: '2026-11-07', label: 'Rd 9' }] }
    const after = feeReport(changed, '2026/27')
    expect(after.totals.payableCents).toBe(before)
    expect(after.drift).toEqual({ derivedCents: 16000, storedCents: 15000 })
    expect(after.drift!.derivedCents).not.toBe(after.drift!.storedCents)
  })
})

describe('payment and waiver input', () => {
  const base = { memberId: '5', amount: '20', receivedOn: '2026-11-01', method: 'cash', reference: '', note: '', payerId: '', target: '', splitIds: [], splitShares: [] }
  it('accepts a plain payment and defaults the payer to the member', () => {
    const r = validatePayment(base, '2026-11-02')
    expect(r.ok && r.value).toMatchObject({ memberId: 5, payerId: 5, amountCents: 2000, appliesTo: null, shares: [{ memberId: 5, amountCents: 2000 }] })
  })
  it('refuses bad amounts, future dates, card methods and card numbers', () => {
    expect(validatePayment({ ...base, amount: '-5' }, '2026-11-02')).toEqual({ ok: false, code: 'amount' })
    expect(validatePayment({ ...base, receivedOn: '2026-12-01' }, '2026-11-02')).toEqual({ ok: false, code: 'date' })
    expect(validatePayment({ ...base, method: 'card' }, '2026-11-02')).toEqual({ ok: false, code: 'method' })
    expect(validatePayment({ ...base, reference: '4111 1111 1111 1111' }, '2026-11-02')).toEqual({ ok: false, code: 'card' })
    expect(validatePayment({ ...base, target: 'bogus' }, '2026-11-02')).toEqual({ ok: false, code: 'target' })
  })
  it('splits evenly or by typed shares that must add up', () => {
    const even = validatePayment({ ...base, amount: '10', splitIds: ['6', '7', '8'] }, '2026-11-02')
    expect(even.ok && even.value.shares.map((s) => s.amountCents)).toEqual([334, 333, 333])
    const typed = validatePayment({ ...base, amount: '10', splitIds: ['6', '7'], splitShares: ['4', '6'] }, '2026-11-02')
    expect(typed.ok && typed.value.shares.map((s) => s.amountCents)).toEqual([400, 600])
    expect(validatePayment({ ...base, amount: '10', splitIds: ['6', '7'], splitShares: ['4', '5'] }, '2026-11-02')).toEqual({ ok: false, code: 'split' })
  })
  it('a waiver needs a note and the right target', () => {
    const w = { memberId: '5', scope: 'game', matchId: 'm1', season: '', amount: '', note: 'Injured' }
    expect(validateWaiver(w).ok).toBe(true)
    expect(validateWaiver({ ...w, note: '' })).toEqual({ ok: false, code: 'note' })
    expect(validateWaiver({ ...w, scope: 'season', season: '' })).toEqual({ ok: false, code: 'season' })
    expect(validateWaiver({ ...w, scope: 'amount', amount: '0' })).toEqual({ ok: false, code: 'amount' })
  })
})
