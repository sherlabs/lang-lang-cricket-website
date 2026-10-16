import { describe, expect, it } from 'vitest'
import {
  STOCK_ERROR_TEXT,
  STOCK_NOTICE_TEXT,
  isLow,
  issueStanding,
  movementDelta,
  onHand,
  owedByPerson,
  owedLines,
  parseStocktake,
  parseWholeQty,
  returnableByDefault,
  stocktakeDeltas,
  validateIssue,
  validateItemInput,
  validateReceive,
  validateRemove,
  validateSettle,
  validateStockVoid,
  type IssueRow,
  type IssueSettlement,
  type MovementRow,
} from '../lib/office/stock'
import { notificationLines } from '../lib/admin/notifications'
import { officeCopy } from '../payload/admin/copy'

const TODAY = '2026-10-12'
const mv = (kind: MovementRow['kind'], qty: number, extra: Partial<MovementRow> = {}): MovementRow => ({ id: 1, itemId: 1, kind, qty, ...extra })
const issue = (extra: Partial<IssueRow> = {}): IssueRow => ({ id: 1, itemId: 1, memberId: 7, qty: 2, issuedOn: '2026-09-01', dueBackOn: '2026-10-01', returnable: true, ...extra })

describe('stock on hand', () => {
  it('adds received, returned and positive adjustments and takes away issued, written off and negative adjustments', () => {
    expect(onHand([mv('received', 10), mv('issued', 3), mv('returned', 1), mv('written-off', 2), mv('adjustment', 4), mv('adjustment', -1)])).toBe(9)
  })
  it('ignores voided rows, so a void puts the stock back', () => {
    const rows = [mv('received', 5), mv('issued', 2)]
    expect(onHand(rows)).toBe(3)
    expect(onHand([rows[0], { ...rows[1], voided: true }])).toBe(5)
  })
  it('a loss linked to an issue settles the debt but does not take stock away twice', () => {
    expect(movementDelta('lost', 2, 9)).toBe(0)
    expect(movementDelta('lost', 2, null)).toBe(-2)
    expect(onHand([mv('received', 5), mv('issued', 2, { issueId: 9 }), mv('lost', 2, { issueId: 9 })])).toBe(3)
  })
  it('can show a negative count when someone issued anyway, and says so', () => {
    expect(onHand([mv('received', 1), mv('issued', 3)])).toBe(-2)
    expect(isLow(-2, 1)).toBe(true)
  })
  it('low is at or below the level, off when no level is set, and never for a switched-off item', () => {
    expect(isLow(3, 3)).toBe(true)
    expect(isLow(4, 3)).toBe(false)
    expect(isLow(0, null)).toBe(false)
    expect(isLow(0, undefined)).toBe(false)
    expect(isLow(0, 0)).toBe(true)
    expect(isLow(0, 5, false)).toBe(false)
  })
  it('kit and equipment come back by default', () => {
    expect(returnableByDefault('kit')).toBe(true)
    expect(returnableByDefault('equipment')).toBe(true)
    expect(returnableByDefault('consumables')).toBe(false)
  })
})

describe('issue status and what is owed', () => {
  it('is Out until something comes back, Part returned, then Returned', () => {
    expect(issueStanding(issue(), [], TODAY)).toMatchObject({ status: 'out', owed: 2 })
    const part: IssueSettlement[] = [{ issueId: 1, kind: 'returned', qty: 1 }]
    expect(issueStanding(issue(), part, TODAY)).toMatchObject({ status: 'part-returned', owed: 1, returned: 1 })
    expect(issueStanding(issue(), [...part, { issueId: 1, kind: 'returned', qty: 1 }], TODAY)).toMatchObject({ status: 'returned', owed: 0 })
  })
  it('a voided return puts the debt back', () => {
    const rows: IssueSettlement[] = [{ issueId: 1, kind: 'returned', qty: 2, voided: true }]
    expect(issueStanding(issue(), rows, TODAY)).toMatchObject({ status: 'out', owed: 2 })
  })
  it('lost units settle the debt; all lost shows Lost', () => {
    expect(issueStanding(issue(), [{ issueId: 1, kind: 'lost', qty: 2 }], TODAY)).toMatchObject({ status: 'lost', owed: 0 })
    expect(issueStanding(issue(), [{ issueId: 1, kind: 'lost', qty: 1 }, { issueId: 1, kind: 'returned', qty: 1 }], TODAY)).toMatchObject({ status: 'returned', owed: 0 })
  })
  it('something not returnable is Given and never owed', () => {
    expect(issueStanding(issue({ returnable: false }), [], TODAY)).toMatchObject({ status: 'given', owed: 0, overdue: false })
  })
  it('a voided issue owes nothing', () => {
    expect(issueStanding(issue({ voided: true }), [], TODAY)).toMatchObject({ status: 'voided', owed: 0 })
  })
  it('is overdue only while something is owed and the due date has passed', () => {
    expect(issueStanding(issue(), [], TODAY)).toMatchObject({ overdue: true, daysOverdue: 11 })
    expect(issueStanding(issue({ dueBackOn: TODAY }), [], TODAY).overdue).toBe(false)
    expect(issueStanding(issue({ dueBackOn: null }), [], TODAY).overdue).toBe(false)
    expect(issueStanding(issue(), [{ issueId: 1, kind: 'returned', qty: 2 }], TODAY).overdue).toBe(false)
  })
  it('ignores settlements that belong to another issue', () => {
    expect(issueStanding(issue(), [{ issueId: 2, kind: 'returned', qty: 2 }], TODAY).owed).toBe(2)
  })
  it('lists what is owed oldest first and groups it by person', () => {
    const issues = [issue({ id: 3, memberId: 8, issuedOn: '2026-10-05', dueBackOn: null, qty: 1 }), issue({ id: 1 }), issue({ id: 2, memberId: 7, issuedOn: '2026-09-10', qty: 1, dueBackOn: '2026-12-01' }), issue({ id: 4, memberId: 9, returnable: false })]
    const lines = owedLines(issues, [{ issueId: 1, kind: 'returned', qty: 2 }], TODAY)
    expect(lines.map((l) => l.issue.id)).toEqual([2, 3])
    expect(owedByPerson(lines)).toEqual([
      { memberId: 7, units: 1, lines: 1, overdueLines: 0 },
      { memberId: 8, units: 1, lines: 1, overdueLines: 0 },
    ])
  })
})

describe('stocktake', () => {
  it('posts the difference, and nothing for a matching count', () => {
    expect(stocktakeDeltas([{ itemId: 1, counted: 5, expected: 8 }, { itemId: 2, counted: 4, expected: 4 }, { itemId: 3, counted: 9, expected: 7 }])).toEqual([
      { itemId: 1, delta: -3 },
      { itemId: 3, delta: 2 },
    ])
  })
  it('a negative stock count is corrected up to what was counted', () => {
    expect(stocktakeDeltas([{ itemId: 1, counted: 0, expected: -2 }])).toEqual([{ itemId: 1, delta: 2 }])
  })
  it('reads count and expected fields, skips blanks and refuses junk', () => {
    const f = (o: Record<string, string>) => new URLSearchParams(o)
    expect(parseStocktake(f({ count_1: '5', expected_1: '8', count_2: '', expected_2: '3' }))).toEqual({ ok: true, value: [{ itemId: 1, counted: 5, expected: 8 }] })
    expect(parseStocktake(f({ count_1: '-5', expected_1: '8' }))).toEqual({ ok: false, code: 'qty' })
    expect(parseStocktake(f({ count_1: '5' }))).toEqual({ ok: false, code: 'changed' })
    expect(parseStocktake(f({ count_2: '', expected_2: '1' }))).toEqual({ ok: false, code: 'nothing' })
    expect(parseStocktake(f({ count_1: '0', expected_1: '-2' }))).toEqual({ ok: true, value: [{ itemId: 1, counted: 0, expected: -2 }] })
  })
})

describe('validation', () => {
  it('quantities are whole numbers within range', () => {
    expect(parseWholeQty('3')).toBe(3)
    for (const bad of ['0', '-1', '1.5', '1e3', '', ' ', 'abc', '100001', undefined, null, 2.5]) expect(parseWholeQty(bad as never)).toBeNull()
    expect(parseWholeQty('0', { min: 0 })).toBe(0)
  })
  it('an item needs a name and a known type; the level is optional; returnable follows the type', () => {
    expect(validateItemInput({ name: ' ', category: 'kit' })).toMatchObject({ ok: false, code: 'name' })
    expect(validateItemInput({ name: 'Cap', category: 'hats' })).toMatchObject({ ok: false, code: 'category' })
    expect(validateItemInput({ name: 'Cap', category: 'kit', reorderLevel: 'x' })).toMatchObject({ ok: false, code: 'qty' })
    expect(validateItemInput({ name: 'Cap', category: 'kit', reorderLevel: '' })).toMatchObject({ ok: true, value: { reorderLevel: null, returnable: true, unit: 'each' } })
    expect(validateItemInput({ name: 'Balls', category: 'consumables', reorderLevel: '6' })).toMatchObject({ ok: true, value: { reorderLevel: 6, returnable: false } })
    expect(validateItemInput({ name: 'Shirt', category: 'kit', returnable: 'no' })).toMatchObject({ ok: true, value: { returnable: false } })
    expect(validateItemInput({ name: 'Cap 4111 1111 1111 1111', category: 'kit' })).toMatchObject({ ok: false, code: 'name' })
  })
  it('receiving needs an item, a quantity and a date that is not in the future', () => {
    expect(validateReceive({ item: '4', qty: '10' }, TODAY)).toMatchObject({ ok: true, value: { itemId: 4, qty: 10, date: TODAY } })
    expect(validateReceive({ item: 'x', qty: '10' }, TODAY)).toMatchObject({ ok: false, code: 'not-found' })
    expect(validateReceive({ item: '4', qty: '0' }, TODAY)).toMatchObject({ ok: false, code: 'qty' })
    expect(validateReceive({ item: '4', qty: '1', date: '2026-10-13' }, TODAY)).toMatchObject({ ok: false, code: 'date' })
    expect(validateReceive({ item: '4', qty: '1', note: 'x'.repeat(301) }, TODAY)).toMatchObject({ ok: false, code: 'text' })
  })
  it('issuing needs an item, a person, a quantity and sensible dates', () => {
    expect(validateIssue({ item: '1', member: '2', qty: '1', dueBackOn: '2026-11-01' }, TODAY)).toMatchObject({ ok: true, value: { dueBackOn: '2026-11-01', anyway: false } })
    expect(validateIssue({ item: '1', member: '', qty: '1' }, TODAY)).toMatchObject({ ok: false, code: 'person' })
    expect(validateIssue({ item: '1', member: '2', qty: '1', dueBackOn: '2026-01-01' }, TODAY)).toMatchObject({ ok: false, code: 'date' })
    expect(validateIssue({ item: '1', member: '2', qty: '1', anyway: 'on' }, TODAY)).toMatchObject({ ok: true, value: { anyway: true } })
  })
  it('return, lost, remove and void checks', () => {
    expect(validateSettle({ issue: '3', qty: '1' })).toMatchObject({ ok: true, value: { issueId: 3, qty: 1 } })
    expect(validateSettle({ issue: '3', qty: '0' })).toMatchObject({ ok: false, code: 'qty' })
    expect(validateRemove({ item: '3', qty: '1', kind: 'lost' })).toMatchObject({ ok: true })
    expect(validateRemove({ item: '3', qty: '1', kind: 'issued' })).toMatchObject({ ok: false, code: 'nothing' })
    expect(validateStockVoid({ id: '3', reason: '' })).toMatchObject({ ok: false, code: 'reason' })
    expect(validateStockVoid({ id: '3', reason: 'typo' })).toMatchObject({ ok: true })
  })
  it('every error and notice code has plain wording', () => {
    for (const t of [...Object.values(STOCK_ERROR_TEXT), ...Object.values(STOCK_NOTICE_TEXT)]) expect(t.length).toBeGreaterThan(5)
  })
})

describe('stock wording and notification lines', () => {
  it('states what the figures leave out, for zero, one and many', () => {
    expect(officeCopy.stock.stat(0, 0, 0)).toMatch(/No items are low/)
    expect(officeCopy.stock.stat(1, 1, 1)).toMatch(/1 item is low/)
    expect(officeCopy.stock.stat(3, 5, 2)).toMatch(/3 items are low/)
    expect(officeCopy.stock.stat(3, 5, 2)).toMatch(/switched-off items/)
    expect(officeCopy.stock.low(1)).toMatch(/1 item is low/)
    expect(officeCopy.stock.low(4)).toMatch(/4 items are low.*not checked/)
    expect(officeCopy.stock.overdue(1)).toMatch(/1 issued item is overdue back/)
    expect(officeCopy.stock.overdue(2)).toMatch(/2 issued items are overdue back.*not counted/)
  })
  it('the committee sees both lines only when there is something to say', () => {
    const base = { latestRun: null, pending: { stories: 0, photos: 0 }, duplicateCount: null, imports: null, social: null } as Record<string, unknown>
    const opts = { isAdmin: false, adminRoute: '/admin', now: new Date(), formatDate: () => '' }
    expect(notificationLines({ ...base, stock: { low: 0, overdue: 0, lowText: '', overdueText: '' } } as never, opts).some((l) => l.key.startsWith('stock'))).toBe(false)
    const keys = notificationLines({ ...base, stock: { low: 2, overdue: 1, lowText: officeCopy.stock.low(2), overdueText: officeCopy.stock.overdue(1) } } as never, opts).map((l) => l.key)
    expect(keys).toContain('stock-low')
    expect(keys).toContain('stock-overdue')
  })
})
