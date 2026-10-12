import { looksLikeCardNumber } from './card'
import { isIsoDate } from './fee-input'

/**
 * Stock and merch tracking, pure rules (wave D spec section 10). Counts are whole numbers; there are no prices. The stock on hand of
 * an item is never stored: it is added up from the movements ledger, ignoring voided rows. What people still owe the club back is
 * added up from the open issues and the returns and losses linked to them.
 */
export const STOCK_CATEGORIES = ['kit', 'equipment', 'consumables', 'other'] as const
export type StockCategory = (typeof STOCK_CATEGORIES)[number]
export const CATEGORY_LABEL: Record<StockCategory, string> = { kit: 'Kit', equipment: 'Equipment', consumables: 'Consumables', other: 'Other' }
export const isStockCategory = (v: unknown): v is StockCategory => typeof v === 'string' && (STOCK_CATEGORIES as readonly string[]).includes(v)
/** Kit and equipment are expected back; consumables and other things are given away unless the item says otherwise. */
export const returnableByDefault = (category: unknown): boolean => category === 'kit' || category === 'equipment'

export const MOVEMENT_KINDS = ['received', 'issued', 'returned', 'lost', 'written-off', 'adjustment'] as const
export type MovementKind = (typeof MOVEMENT_KINDS)[number]
export const isMovementKind = (v: unknown): v is MovementKind => typeof v === 'string' && (MOVEMENT_KINDS as readonly string[]).includes(v)
export const KIND_LABEL: Record<MovementKind, string> = {
  received: 'Received',
  issued: 'Issued',
  returned: 'Returned',
  lost: 'Lost',
  'written-off': 'Written off',
  adjustment: 'Stocktake or correction',
}

export const MAX_QTY = 100000

/**
 * How one movement changes the stock on hand. Received, returned and positive adjustments add; issued, written-off and negative
 * adjustments take away. A loss that is linked to an issue changes nothing, because the item left the shelf when it was issued and
 * the loss only settles what the person owed; a loss with no issue (gone missing from the store) takes stock away.
 * The SQL in `lib/stock-office-queries.ts` repeats this table, and an integration test compares the two.
 */
export function movementDelta(kind: MovementKind, qty: number, issueId?: number | null): number {
  switch (kind) {
    case 'received':
    case 'returned':
    case 'adjustment':
      return qty
    case 'issued':
    case 'written-off':
      return -qty
    case 'lost':
      return issueId ? 0 : -qty
  }
}

export type MovementRow = { id: number; itemId: number; kind: MovementKind; qty: number; issueId?: number | null; voided?: boolean }

/** Stock on hand for one item: every live movement, added up. */
export function onHand(rows: readonly Pick<MovementRow, 'kind' | 'qty' | 'issueId' | 'voided'>[]): number {
  let total = 0
  for (const r of rows) if (!r.voided) total += movementDelta(r.kind, r.qty, r.issueId)
  return total
}

/** Low means there is a reorder level and the stock is at or below it. No level set means the item is not checked. */
export function isLow(onHandNow: number, reorderLevel: number | null | undefined, active = true): boolean {
  return active && typeof reorderLevel === 'number' && reorderLevel >= 0 && onHandNow <= reorderLevel
}

// ---- issues -----------------------------------------------------------------------------------------------------------------

export type IssueRow = { id: number; itemId: number; memberId: number | null; qty: number; issuedOn: string; dueBackOn: string | null; returnable: boolean; voided?: boolean }
export type IssueSettlement = { issueId: number; kind: 'returned' | 'lost'; qty: number; voided?: boolean }
export type IssueStatus = 'out' | 'part-returned' | 'returned' | 'lost' | 'given' | 'voided'
export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  out: 'Out',
  'part-returned': 'Part returned',
  returned: 'Returned',
  lost: 'Lost',
  given: 'Given',
  voided: 'Voided',
}

export type IssueStanding = { returned: number; lost: number; owed: number; status: IssueStatus; overdue: boolean; daysOverdue: number }

const dayNumber = (d: string): number => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000)

/**
 * Where one issue stands. Returned and lost units (voided rows ignored) settle what the person owes. An issue that is not
 * returnable is simply Given. An issue is overdue when something is still owed and the due date is before today.
 */
export function issueStanding(issue: IssueRow, settlements: readonly IssueSettlement[], today: string): IssueStanding {
  if (issue.voided) return { returned: 0, lost: 0, owed: 0, status: 'voided', overdue: false, daysOverdue: 0 }
  let returned = 0
  let lost = 0
  for (const s of settlements) {
    if (s.issueId !== issue.id || s.voided) continue
    if (s.kind === 'returned') returned += s.qty
    else lost += s.qty
  }
  if (!issue.returnable) return { returned, lost, owed: 0, status: 'given', overdue: false, daysOverdue: 0 }
  const owed = Math.max(0, issue.qty - returned - lost)
  let status: IssueStatus
  if (owed > 0) status = returned + lost > 0 ? 'part-returned' : 'out'
  else status = returned > 0 ? 'returned' : 'lost'
  const overdue = owed > 0 && Boolean(issue.dueBackOn) && (issue.dueBackOn as string) < today
  return { returned, lost, owed, status, overdue, daysOverdue: overdue ? dayNumber(today) - dayNumber(issue.dueBackOn as string) : 0 }
}

export type OwedLine = { issue: IssueRow; owed: number; overdue: boolean; daysOverdue: number; status: IssueStatus }

/** Open returnable issues with something still owed, oldest first. */
export function owedLines(issues: readonly IssueRow[], settlements: readonly IssueSettlement[], today: string): OwedLine[] {
  const out: OwedLine[] = []
  for (const issue of issues) {
    const s = issueStanding(issue, settlements, today)
    if (s.owed > 0) out.push({ issue, owed: s.owed, overdue: s.overdue, daysOverdue: s.daysOverdue, status: s.status })
  }
  return out.sort((a, b) => a.issue.issuedOn.localeCompare(b.issue.issuedOn) || a.issue.id - b.issue.id)
}

export type PersonOwed = { memberId: number | null; units: number; lines: number; overdueLines: number }
/** One line per person: how many units they hold and how many of the issues are overdue. */
export function owedByPerson(lines: readonly OwedLine[]): PersonOwed[] {
  const map = new Map<number | null, PersonOwed>()
  for (const l of lines) {
    const key = l.issue.memberId
    const p = map.get(key) ?? { memberId: key, units: 0, lines: 0, overdueLines: 0 }
    p.units += l.owed
    p.lines += 1
    if (l.overdue) p.overdueLines += 1
    map.set(key, p)
  }
  return [...map.values()]
}

// ---- stocktake --------------------------------------------------------------------------------------------------------------

export type Count = { itemId: number; counted: number; expected: number }
/** The difference to post for each counted item. An item that matches posts nothing. */
export function stocktakeDeltas(counts: readonly Count[]): { itemId: number; delta: number }[] {
  return counts.filter((c) => c.counted !== c.expected).map((c) => ({ itemId: c.itemId, delta: c.counted - c.expected }))
}

// ---- validation -------------------------------------------------------------------------------------------------------------

export type StockError =
  | 'forbidden'
  | 'not-found'
  | 'name'
  | 'category'
  | 'qty'
  | 'date'
  | 'text'
  | 'person'
  | 'item-inactive'
  | 'not-enough'
  | 'too-many'
  | 'reason'
  | 'would-go-negative'
  | 'has-returns'
  | 'not-returnable'
  | 'changed'
  | 'nothing'
  | 'save'
export type Check<T> = { ok: true; value: T } | { ok: false; code: StockError }

const posId = (v: unknown): number | null => {
  const n = typeof v === 'string' && /^\d{1,10}$/.test(v.trim()) ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isInteger(n) && n > 0 && n < 2_000_000_000 ? n : null
}
export const parseStockId = posId

/** A whole number from a form field: digits only, so "1.5", "-2", "1e3" and "" are refused. */
export function parseWholeQty(v: unknown, opts: { min?: number; max?: number } = {}): number | null {
  const min = opts.min ?? 1
  const max = opts.max ?? MAX_QTY
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string' && /^\d{1,7}$/.test(v.trim())) n = Number(v.trim())
  else return null
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

const text = (v: unknown, max: number): string | null => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t.length <= max && !looksLikeCardNumber(t) ? t : null
}
/** An optional note: empty is fine, too long or card-shaped is not. */
export function validateStockNote(v: unknown, max = 300): Check<string> {
  if (v === undefined || v === null) return { ok: true, value: '' }
  const t = text(v, max)
  return t === null ? { ok: false, code: 'text' } : { ok: true, value: t }
}

export const NONCE = /^[0-9a-f-]{36}$/
export const cleanNonce = (v: unknown): string | null => (typeof v === 'string' && NONCE.test(v) ? v : null)

export type ItemInput = { name: string; groupName: string | null; size: string | null; category: StockCategory; unit: string; reorderLevel: number | null; location: string | null; returnable: boolean }

/** The quick-add item form. Returnable follows the category unless the person ticked or unticked it. */
export function validateItemInput(raw: { name: unknown; groupName?: unknown; size?: unknown; category: unknown; unit?: unknown; reorderLevel?: unknown; location?: unknown; returnable?: unknown }): Check<ItemInput> {
  const name = text(raw.name, 120)
  if (!name) return { ok: false, code: 'name' }
  if (!isStockCategory(raw.category)) return { ok: false, code: 'category' }
  const groupName = text(raw.groupName ?? '', 80)
  const size = text(raw.size ?? '', 40)
  const unit = text(raw.unit ?? '', 30)
  const location = text(raw.location ?? '', 120)
  if (groupName === null || size === null || unit === null || location === null) return { ok: false, code: 'text' }
  const levelText = typeof raw.reorderLevel === 'string' ? raw.reorderLevel.trim() : raw.reorderLevel
  const reorderLevel = levelText === '' || levelText === undefined || levelText === null ? null : parseWholeQty(levelText, { min: 0 })
  if (levelText !== '' && levelText !== undefined && levelText !== null && reorderLevel === null) return { ok: false, code: 'qty' }
  const returnable = raw.returnable === 'yes' || raw.returnable === 'on' || raw.returnable === true ? true : raw.returnable === 'no' ? false : returnableByDefault(raw.category)
  return { ok: true, value: { name, groupName: groupName || null, size: size || null, category: raw.category, unit: unit || 'each', reorderLevel, location: location || null, returnable } }
}

export type ReceiveInput = { itemId: number; qty: number; date: string; note: string }
export function validateReceive(raw: { item: unknown; qty: unknown; date?: unknown; note?: unknown }, today: string): Check<ReceiveInput> {
  const itemId = posId(raw.item)
  if (itemId === null) return { ok: false, code: 'not-found' }
  const qty = parseWholeQty(raw.qty)
  if (qty === null) return { ok: false, code: 'qty' }
  const date = typeof raw.date === 'string' && raw.date.trim() ? raw.date.trim() : today
  if (!isIsoDate(date) || date > today) return { ok: false, code: 'date' }
  const note = validateStockNote(raw.note)
  if (!note.ok) return note
  return { ok: true, value: { itemId, qty, date, note: note.value } }
}

export type IssueInput = { itemId: number; memberId: number; qty: number; issuedOn: string; dueBackOn: string | null; note: string; anyway: boolean }
export function validateIssue(raw: { item: unknown; member: unknown; qty: unknown; issuedOn?: unknown; dueBackOn?: unknown; note?: unknown; anyway?: unknown }, today: string): Check<IssueInput> {
  const itemId = posId(raw.item)
  if (itemId === null) return { ok: false, code: 'not-found' }
  const memberId = posId(raw.member)
  if (memberId === null) return { ok: false, code: 'person' }
  const qty = parseWholeQty(raw.qty)
  if (qty === null) return { ok: false, code: 'qty' }
  const issuedOn = typeof raw.issuedOn === 'string' && raw.issuedOn.trim() ? raw.issuedOn.trim() : today
  if (!isIsoDate(issuedOn) || issuedOn > today) return { ok: false, code: 'date' }
  const due = typeof raw.dueBackOn === 'string' ? raw.dueBackOn.trim() : ''
  if (due && (!isIsoDate(due) || due < issuedOn)) return { ok: false, code: 'date' }
  const note = validateStockNote(raw.note)
  if (!note.ok) return note
  return { ok: true, value: { itemId, memberId, qty, issuedOn, dueBackOn: due || null, note: note.value, anyway: raw.anyway === 'yes' || raw.anyway === 'on' } }
}

export type SettleInput = { issueId: number; qty: number; note: string }
/** Return or Lost against one issue: a quantity of at least one and a note. The upper limit (what is still owed) is checked under the lock. */
export function validateSettle(raw: { issue: unknown; qty: unknown; note?: unknown }): Check<SettleInput> {
  const issueId = posId(raw.issue)
  if (issueId === null) return { ok: false, code: 'not-found' }
  const qty = parseWholeQty(raw.qty)
  if (qty === null) return { ok: false, code: 'qty' }
  const note = validateStockNote(raw.note)
  if (!note.ok) return note
  return { ok: true, value: { issueId, qty, note: note.value } }
}

export type RemoveInput = { itemId: number; qty: number; kind: 'lost' | 'written-off'; note: string }
/** Stock that is gone without being issued: lost from the store, or worn out and written off. */
export function validateRemove(raw: { item: unknown; qty: unknown; kind: unknown; note?: unknown }): Check<RemoveInput> {
  const itemId = posId(raw.item)
  if (itemId === null) return { ok: false, code: 'not-found' }
  const qty = parseWholeQty(raw.qty)
  if (qty === null) return { ok: false, code: 'qty' }
  if (raw.kind !== 'lost' && raw.kind !== 'written-off') return { ok: false, code: 'nothing' }
  const note = validateStockNote(raw.note)
  if (!note.ok) return note
  return { ok: true, value: { itemId, qty, kind: raw.kind, note: note.value } }
}

export type VoidInput = { id: number; reason: string }
export function validateStockVoid(raw: { id: unknown; reason: unknown }): Check<VoidInput> {
  const id = posId(raw.id)
  if (id === null) return { ok: false, code: 'not-found' }
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : ''
  if (!reason || reason.length > 300 || looksLikeCardNumber(reason)) return { ok: false, code: 'reason' }
  return { ok: true, value: { id, reason } }
}

/**
 * The stocktake form: fields `count_<id>` (what was counted) and `expected_<id>` (what the screen showed when counting began). A
 * blank count means "not counted". The expected figure lets the server refuse if stock moved while people were counting.
 */
export function parseStocktake(form: { get(name: string): unknown; keys(): Iterable<string> }): Check<Count[]> {
  const counts: Count[] = []
  for (const key of form.keys()) {
    const m = /^count_(\d{1,10})$/.exec(key)
    if (!m) continue
    const raw = form.get(key)
    if (typeof raw !== 'string' || !raw.trim()) continue
    const counted = parseWholeQty(raw, { min: 0 })
    if (counted === null) return { ok: false, code: 'qty' }
    const exp = form.get(`expected_${m[1]}`)
    const expected = typeof exp === 'string' && /^-?\d{1,7}$/.test(exp.trim()) ? Number(exp.trim()) : null
    if (expected === null) return { ok: false, code: 'changed' }
    if (counts.some((c) => c.itemId === Number(m[1]))) continue
    counts.push({ itemId: Number(m[1]), counted, expected })
  }
  return counts.length ? { ok: true, value: counts } : { ok: false, code: 'nothing' }
}

// ---- wording ----------------------------------------------------------------------------------------------------------------

export const STOCK_ERROR_TEXT: Record<StockError, string> = {
  forbidden: 'You are not allowed to do that.',
  'not-found': 'That could not be found. It may have been removed.',
  name: 'Please give the item a name (not too long).',
  category: 'Please pick a type from the list.',
  qty: 'Quantities are whole numbers, for example 3.',
  date: 'Please pick a valid date that is not in the future. A due date cannot be before the day it was issued.',
  text: 'That text is too long, or looks like a card number.',
  person: 'Please pick a person from the list. Only active players, volunteers, committee and coaches can be given kit.',
  'item-inactive': 'That item is switched off. Switch it back on in its full details before issuing it.',
  'not-enough': 'There is not enough in stock. Tick "Issue anyway" if the count is wrong and you will fix it with a stocktake.',
  'too-many': 'That is more than the person still holds.',
  reason: 'A reason is needed (short, and no card numbers).',
  'would-go-negative': 'That would take the stock below zero. Void what was issued or written off from it first, or do a stocktake.',
  'has-returns': 'Something has been returned or marked lost against this issue. Void those first.',
  'not-returnable': 'That item is not expected back.',
  changed: 'The stock changed while you were counting. Count again.',
  nothing: 'Nothing to save. Type at least one count.',
  save: 'That could not be saved. Check the details and try again.',
}

export const STOCK_NOTICE_TEXT = {
  'item-added': 'Item added.',
  received: 'Stock received.',
  issued: 'Issued.',
  returned: 'Returned.',
  lost: 'Marked as lost.',
  removed: 'Stock removed.',
  voided: 'Entry voided. The stock has been put back the way it was.',
  stocktake: 'Stocktake saved.',
  'stocktake-none': 'Every count matched, so nothing needed changing.',
} as const
export type StockNotice = keyof typeof STOCK_NOTICE_TEXT
export const isStockNotice = (v: unknown): v is StockNotice => typeof v === 'string' && v in STOCK_NOTICE_TEXT
export const isStockError = (v: unknown): v is StockError => typeof v === 'string' && v in STOCK_ERROR_TEXT

/** CSV header for the owed list. Names, so admin only. */
export const OWED_HEADER = ['Name', 'Item', 'Size', 'Number out', 'Issued on', 'Due back', 'Days overdue', 'Status'] as const
