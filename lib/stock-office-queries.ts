import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload, PayloadRequest, TypedUser, Where } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { currentClubDate } from '@/lib/selection/club-date'
import { isAdminUser, isStaffUser } from '@/payload/access'
import { listMemberNames } from './members-queries'
import { inTransaction, noon } from './office/fee-load'
import {
  CATEGORY_LABEL,
  STOCK_CATEGORIES,
  cleanNonce,
  isLow,
  issueStanding,
  movementDelta,
  owedByPerson,
  owedLines,
  parseStockId,
  returnableByDefault,
  stocktakeDeltas,
  validateIssue,
  validateItemInput,
  validateReceive,
  validateRemove,
  validateSettle,
  validateStockVoid,
  type Count,
  type IssueRow,
  type IssueSettlement,
  type IssueStatus,
  type MovementKind,
  type OwedLine,
  type StockCategory,
  type StockError,
  type StockNotice,
} from './office/stock'
import { fullNamesFor, namesFor } from './volunteers-office-queries'

/**
 * The data layer for stock and merch (wave D spec section 10). The committee (admin and editor) may use every function here except
 * the owed export, which has names and is admin only. The ledger collections allow nobody to write over REST, so these writes (made
 * with the access override after the check) are the only door. Anything that changes the count runs in one transaction that first
 * locks the item rows (`SELECT ... FOR UPDATE`), so two people cannot hand out the last shirt twice.
 */
const staffOnly = (user: unknown): user is TypedUser => isStaffUser(user as never)
type Doc = Record<string, unknown>
const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

export type ActionResult = { ok: true; notice: StockNotice; n?: number } | { ok: false; code: StockError }
const fail = (code: StockError): ActionResult => ({ ok: false, code })
const done = (notice: StockNotice, n?: number): ActionResult => ({ ok: true, notice, ...(n !== undefined ? { n } : {}) })

// ---- raw SQL on the right connection ------------------------------------------------------------------------------------------

type Executor = { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: Record<string, unknown>[] }> }
/** The connection a query must use: inside a transaction it is that transaction's, otherwise the pool. A lock taken on the pool would be released at once. */
function executorFor(payload: Payload, req?: Partial<PayloadRequest>): Executor {
  const db = payload.db as unknown as { drizzle: Executor; sessions?: Record<string, { db: Executor } | undefined> }
  const id = req?.transactionID
  if (id !== undefined && id !== null) {
    const session = db.sessions?.[String(id)]
    if (!session) throw new Error('stock: the transaction session is missing, refusing to run unlocked')
    return session.db
  }
  return db.drizzle
}

/**
 * Stock on hand per item, added up in SQL from the movements that are not voided. This repeats `movementDelta` in
 * `lib/office/stock.ts` (an integration test compares the two). Items with no movements are absent (zero).
 */
export async function onHandMap(payload: Payload, ids?: readonly number[], req?: Partial<PayloadRequest>): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (ids && ids.length === 0) return out
  const filter = ids ? sql`AND item_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``
  const res = await executorFor(payload, req).execute(sql`
    SELECT item_id, COALESCE(SUM(CASE kind
      WHEN 'received' THEN qty WHEN 'returned' THEN qty WHEN 'adjustment' THEN qty
      WHEN 'issued' THEN -qty WHEN 'written-off' THEN -qty
      WHEN 'lost' THEN CASE WHEN issue_id IS NULL THEN -qty ELSE 0 END
      ELSE 0 END), 0)::int AS on_hand
    FROM "payload"."stock_movements" WHERE voided_at IS NULL ${filter} GROUP BY item_id`)
  for (const r of res.rows) out.set(Number(r.item_id), Number(r.on_hand))
  return out
}

/** Locks the item rows in id order for the rest of the transaction. Returns false if one does not exist. */
async function lockItems(payload: Payload, req: Partial<PayloadRequest>, ids: readonly number[]): Promise<boolean> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b)
  if (!sorted.length) return false
  const res = await executorFor(payload, req).execute(sql`SELECT id FROM "payload"."stock_items" WHERE id IN (${sql.join(sorted.map((i) => sql`${i}`), sql`, `)}) ORDER BY id FOR UPDATE`)
  return res.rows.length === sorted.length
}

// ---- loading ----------------------------------------------------------------------------------------------------------------

export type ItemView = { id: number; name: string; groupName: string; size: string; category: StockCategory; categoryLabel: string; unit: string; reorderLevel: number | null; location: string; returnable: boolean; active: boolean; onHand: number; low: boolean; notes: string }

function itemView(d: Doc, hand: number): ItemView {
  const category = (STOCK_CATEGORIES as readonly string[]).includes(d.category as string) ? (d.category as StockCategory) : 'other'
  const active = d.active !== false
  const level = typeof d.reorderLevel === 'number' ? d.reorderLevel : d.reorderLevel === null || d.reorderLevel === undefined ? null : Number(d.reorderLevel)
  return {
    id: d.id as number,
    name: String(d.name ?? ''),
    groupName: String(d.groupName ?? ''),
    size: String(d.size ?? ''),
    category,
    categoryLabel: CATEGORY_LABEL[category],
    unit: String(d.unit ?? 'each'),
    reorderLevel: level,
    location: String(d.location ?? ''),
    returnable: typeof d.returnable === 'boolean' ? d.returnable : returnableByDefault(category),
    active,
    onHand: hand,
    low: isLow(hand, level, active),
    notes: String(d.notes ?? ''),
  }
}

const itemLabel = (i: { name: string; size: string }): string => (i.size ? `${i.name}, ${i.size}` : i.name)

async function loadItems(payload: Payload): Promise<ItemView[]> {
  const [res, hand] = await Promise.all([payload.find({ collection: 'stock-items', pagination: false, depth: 0, sort: 'name', overrideAccess: true }), onHandMap(payload)])
  return (res.docs as unknown as Doc[]).map((d) => itemView(d, hand.get(d.id as number) ?? 0))
}

function issueRow(d: Doc): IssueRow {
  return { id: d.id as number, itemId: idOf(d.item) ?? 0, memberId: idOf(d.member), qty: num(d.qty), issuedOn: day(d.issuedOn), dueBackOn: day(d.dueBackOn) || null, returnable: d.returnable !== false, voided: Boolean(d.voidedAt) }
}

/** Every live issue and the live returns and losses linked to issues. Club scale: a few hundred rows. */
async function loadLedger(payload: Payload, extra?: { memberId?: number }): Promise<{ issues: IssueRow[]; settlements: IssueSettlement[] }> {
  const clauses: Where[] = [{ voidedAt: { exists: false } }]
  if (extra?.memberId) clauses.push({ member: { equals: extra.memberId } })
  const where: Where = { and: clauses }
  const issues = (await payload.find({ collection: 'stock-issues', where, pagination: false, depth: 0, sort: 'issuedOn', overrideAccess: true })).docs as unknown as Doc[]
  const rows = issues.map(issueRow)
  if (!rows.length) return { issues: [], settlements: [] }
  const moves = (
    await payload.find({
      collection: 'stock-movements',
      where: { and: [{ voidedAt: { exists: false } }, { kind: { in: ['returned', 'lost'] } }, { issue: { in: rows.map((r) => r.id) } }] },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as unknown as Doc[]
  const settlements: IssueSettlement[] = moves.flatMap((m) => {
    const issueId = idOf(m.issue)
    return issueId ? [{ issueId, kind: m.kind === 'lost' ? ('lost' as const) : ('returned' as const), qty: num(m.qty) }] : []
  })
  return { issues: rows, settlements }
}

export type OwedView = { issueId: number; memberId: number | null; person: string; itemId: number; item: string; owed: number; issuedOn: string; dueBackOn: string | null; overdue: boolean; daysOverdue: number; status: IssueStatus }
export type PersonSummary = { memberId: number | null; person: string; units: number; lines: number; overdueLines: number }

function owedViews(lines: OwedLine[], items: Map<number, ItemView>, names: Map<number, string>): OwedView[] {
  return lines.map((l) => {
    const item = items.get(l.issue.itemId)
    return {
      issueId: l.issue.id,
      memberId: l.issue.memberId,
      person: l.issue.memberId ? (names.get(l.issue.memberId) ?? 'Former member') : 'Former member',
      itemId: l.issue.itemId,
      item: item ? itemLabel(item) : 'Removed item',
      owed: l.owed,
      issuedOn: l.issue.issuedOn,
      dueBackOn: l.issue.dueBackOn,
      overdue: l.overdue,
      daysOverdue: l.daysOverdue,
      status: l.status,
    }
  })
}

export type StockPage = {
  isAdmin: boolean
  items: ItemView[]
  /** Every item in use, for the "stock received" picker, whatever the list is filtered to. */
  pickList: { id: number; label: string }[]
  groups: { category: StockCategory; label: string; items: ItemView[] }[]
  counts: { low: number; inUse: number; owedUnits: number; owedPeople: number; overdue: number }
  owed: OwedView[]
  byPerson: PersonSummary[]
  q: string
  show: 'all' | 'low' | 'switched-off'
  tab: 'items' | 'owed'
  today: string
}

/** The Stock page: items with stock on hand, or what is owed back. */
export async function getStockPage(user: unknown, query: { tab?: string; q?: string; show?: string }): Promise<StockPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const [items, ledger] = await Promise.all([loadItems(payload), loadLedger(payload)])
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const lines = owedLines(ledger.issues, ledger.settlements, today)
  const names = await namesFor(payload, lines.map((l) => l.issue.memberId).filter((x): x is number => x !== null), today)
  const owed = owedViews(lines, itemMap, names)
  const byPerson = owedByPerson(lines)
    .map((p) => ({ ...p, person: p.memberId ? (names.get(p.memberId) ?? 'Former member') : 'Former member' }))
    .sort((a, b) => b.overdueLines - a.overdueLines || a.person.localeCompare(b.person))
  const show = query.show === 'low' ? 'low' : query.show === 'switched-off' ? 'switched-off' : 'all'
  const q = (query.q ?? '').trim().slice(0, 80)
  const needle = q.toLowerCase()
  const shown = items.filter((i) => {
    if (show === 'switched-off') return !i.active
    if (!i.active) return false
    if (show === 'low' && !i.low) return false
    return !needle || [i.name, i.groupName, i.size, i.location, i.categoryLabel].some((t) => t.toLowerCase().includes(needle))
  })
  const groups = STOCK_CATEGORIES.map((category) => ({ category, label: CATEGORY_LABEL[category], items: shown.filter((i) => i.category === category) })).filter((g) => g.items.length)
  return {
    isAdmin: isAdminUser(user as never),
    items: shown,
    pickList: items.filter((i) => i.active).map((i) => ({ id: i.id, label: itemLabel(i) })),
    groups,
    counts: { low: items.filter((i) => i.low).length, inUse: items.filter((i) => i.active).length, owedUnits: lines.reduce((n, l) => n + l.owed, 0), owedPeople: byPerson.length, overdue: lines.filter((l) => l.overdue).length },
    owed,
    byPerson,
    q,
    show,
    tab: query.tab === 'owed' ? 'owed' : 'items',
    today,
  }
}

export type MovementView = { id: number; kind: MovementKind; qty: number; date: string; person: string | null; note: string; voided: boolean; voidReason: string; issueId: number | null; issueStatus: IssueStatus | null }
export type ItemPage = { item: ItemView; movements: MovementView[]; people: { id: number; displayName: string }[]; holders: PersonSummary[]; today: string }

/** One item: its history (newest first) with a void button, plus the forms to issue it. */
export async function getItemPage(user: unknown, id: number): Promise<ItemPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const doc = (await payload.findByID({ collection: 'stock-items', id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Doc | null
  if (!doc) return null
  const hand = (await onHandMap(payload, [id])).get(id) ?? 0
  const moves = (await payload.find({ collection: 'stock-movements', where: { item: { equals: id } }, sort: ['-date', '-id'], limit: 200, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  const issueRows = (await payload.find({ collection: 'stock-issues', where: { item: { equals: id } }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  const issues = new Map(issueRows.map((d) => [d.id as number, issueRow(d)]))
  const settle = await payload.find({
    collection: 'stock-movements',
    where: { and: [{ voidedAt: { exists: false } }, { kind: { in: ['returned', 'lost'] } }, { issue: { in: [...issues.keys(), 0] } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const settlements: IssueSettlement[] = (settle.docs as unknown as Doc[]).flatMap((m) => {
    const issueId = idOf(m.issue)
    return issueId ? [{ issueId, kind: m.kind === 'lost' ? ('lost' as const) : ('returned' as const), qty: num(m.qty) }] : []
  })
  const names = await namesFor(payload, [...moves.map((m) => idOf(m.member)), ...issueRows.map((d) => idOf(d.member))].filter((x): x is number => x !== null), today)
  const movements = moves.map((m): MovementView => {
    const memberId = idOf(m.member)
    const issueId = idOf(m.issue)
    const issue = issueId ? issues.get(issueId) : undefined
    return {
      id: m.id as number,
      kind: m.kind as MovementKind,
      qty: num(m.qty),
      date: day(m.date),
      person: memberId ? (names.get(memberId) ?? 'Former member') : null,
      note: String(m.note ?? ''),
      voided: Boolean(m.voidedAt),
      voidReason: String(m.voidReason ?? ''),
      issueId,
      issueStatus: m.kind === 'issued' && issue ? issueStanding(issue, settlements, today).status : null,
    }
  })
  const live = [...issues.values()].filter((i) => !i.voided)
  const lines = owedLines(live, settlements, today)
  const holders = owedByPerson(lines).map((p) => ({ ...p, person: p.memberId ? (names.get(p.memberId) ?? 'Former member') : 'Former member' }))
  const people = (await listMemberNames(user, 'stock')).map((p) => ({ id: p.id, displayName: p.displayName }))
  return { item: itemView(doc, hand), movements, people, holders, today }
}

export type HeldView = { issueId: number; itemId: number; item: string; qty: number; owed: number; issuedOn: string; dueBackOn: string | null; status: IssueStatus; overdue: boolean; daysOverdue: number; returnable: boolean }
export type PersonPage = { memberId: number; person: string; held: HeldView[]; history: HeldView[]; today: string }

/** One person's kit: what they hold now (one tap to return), and what they have had before. */
export async function getPersonPage(user: unknown, memberId: number): Promise<PersonPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const [items, ledger] = await Promise.all([loadItems(payload), loadLedger(payload, { memberId })])
  // Only people who can be given kit, or who already have a stock record, may be opened: this page must not become an "everyone" directory.
  const listed = (await listMemberNames(user, 'stock')).find((p) => p.id === memberId)
  if (!listed && !ledger.issues.length) return null
  const person = listed ? listed.displayName : ((await namesFor(payload, [memberId], today)).get(memberId) ?? null)
  if (!person) return null
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const all = ledger.issues
    .map((issue): HeldView => {
      const s = issueStanding(issue, ledger.settlements, today)
      const item = itemMap.get(issue.itemId)
      return { issueId: issue.id, itemId: issue.itemId, item: item ? itemLabel(item) : 'Removed item', qty: issue.qty, owed: s.owed, issuedOn: issue.issuedOn, dueBackOn: issue.dueBackOn, status: s.status, overdue: s.overdue, daysOverdue: s.daysOverdue, returnable: issue.returnable }
    })
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.issueId - a.issueId)
  return { memberId, person, held: all.filter((h) => h.owed > 0), history: all.filter((h) => h.owed === 0).slice(0, 50), today }
}

export type CountRow = { id: number; label: string; category: StockCategory; categoryLabel: string; groupName: string; expected: number; counted: number | null; delta: number | null }
export type StocktakePage = { rows: CountRow[]; review: boolean; changes: number; today: string }

/** The stocktake: every item in use with what the ledger says. With counts typed in (a GET), shows the differences before anything is posted. */
export async function getStocktakePage(user: unknown, typed: ReadonlyMap<number, number>): Promise<StocktakePage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const items = (await loadItems(payload)).filter((i) => i.active)
  const rows = items.map((i): CountRow => {
    const counted = typed.get(i.id) ?? null
    return { id: i.id, label: itemLabel(i), category: i.category, categoryLabel: i.categoryLabel, groupName: i.groupName, expected: i.onHand, counted, delta: counted === null ? null : counted - i.onHand }
  })
  rows.sort((a, b) => STOCK_CATEGORIES.indexOf(a.category) - STOCK_CATEGORIES.indexOf(b.category) || a.groupName.localeCompare(b.groupName) || a.label.localeCompare(b.label))
  return { rows, review: typed.size > 0, changes: rows.filter((r) => r.delta !== null && r.delta !== 0).length, today: currentClubDate() }
}

/** `out` is units (items) held by people, the same unit as the Owed back tab; `overdue` counts loans. */
export type StockFigures = { low: number; overdue: number; out: number }

/** The two numbers the Home page and the Club office tile use. Null for anyone who is not committee. A failed read drops the line, not the page. */
export async function stockFigures(user: unknown): Promise<StockFigures | null> {
  if (!staffOnly(user)) return null
  try {
    const payload = await getPayloadClient()
    const today = currentClubDate()
    const [items, ledger] = await Promise.all([loadItems(payload), loadLedger(payload)])
    const lines = owedLines(ledger.issues, ledger.settlements, today)
    return { low: items.filter((i) => i.low).length, overdue: lines.filter((l) => l.overdue).length, out: lines.reduce((n, l) => n + l.owed, 0) }
  } catch (err) {
    console.warn('[office] stock figures unavailable:', (err as Error).message)
    return null
  }
}

// ---- writes -----------------------------------------------------------------------------------------------------------------

type CreateArgs = { collection: 'stock-movements' | 'stock-issues'; data: Doc }
async function create(payload: Payload, req: Partial<PayloadRequest>, { collection, data }: CreateArgs): Promise<{ id: number }> {
  return (await payload.create({ collection, data: data as never, overrideAccess: true, depth: 0, req: req as PayloadRequest })) as unknown as { id: number }
}

const keyUsed = async (payload: Payload, key: string | null, prefix = false): Promise<boolean> =>
  key !== null && (await payload.count({ collection: 'stock-movements', where: { idempotencyKey: prefix ? { like: `${key}` } : { equals: key } }, overrideAccess: true })).totalDocs > 0

/** Adds an item. The same name, size and type again is not added twice. */
export async function addItem(user: unknown, raw: Parameters<typeof validateItemInput>[0]): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const v = validateItemInput(raw)
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  const same = await payload.count({
    collection: 'stock-items',
    where: { and: [{ name: { equals: v.value.name } }, { size: v.value.size ? { equals: v.value.size } : { exists: false } }, { category: { equals: v.value.category } }] },
    overrideAccess: true,
  })
  if (same.totalDocs > 0) return done('item-added')
  try {
    await payload.create({ collection: 'stock-items', data: { name: v.value.name, groupName: v.value.groupName, size: v.value.size, category: v.value.category, unit: v.value.unit, reorderLevel: v.value.reorderLevel, location: v.value.location, returnable: v.value.returnable, active: true } as never, overrideAccess: true, depth: 0 })
  } catch (err) {
    console.warn('[office] add stock item failed:', (err as Error).message)
    return fail('save')
  }
  return done('item-added')
}

/** Stock coming in. Nothing to lock: adding can never take the count below zero. */
export async function receiveStock(user: unknown, raw: Parameters<typeof validateReceive>[0] & { nonce?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const v = validateReceive(raw, currentClubDate())
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  const key = cleanNonce(raw.nonce)
  if (await keyUsed(payload, key)) return done('already-saved')
  const item = (await payload.findByID({ collection: 'stock-items', id: v.value.itemId, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Doc | null
  if (!item) return fail('not-found')
  try {
    await create(payload, {}, { collection: 'stock-movements', data: { item: v.value.itemId, kind: 'received', qty: v.value.qty, date: noon(v.value.date), note: v.value.note || null, idempotencyKey: key, recordedBy: user.id } })
  } catch (err) {
    if (await keyUsed(payload, key).catch(() => false)) return done('already-saved')
    console.warn('[office] receive stock failed:', (err as Error).message)
    return fail('save')
  }
  return done('received')
}

/** Hands stock to a person. Locks the item, refuses to go below zero unless "issue anyway" was ticked. */
export async function issueStock(user: unknown, raw: Parameters<typeof validateIssue>[0] & { nonce?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const v = validateIssue(raw, currentClubDate())
  if (!v.ok) return fail(v.code)
  // The person must be on the stock list (active, and a player, volunteer, committee member or coach): the server decides, not the form.
  const allowed = await listMemberNames(user, 'stock')
  if (!allowed.some((p) => p.id === v.value.memberId)) return fail('person')
  const payload = await getPayloadClient()
  const key = cleanNonce(raw.nonce)
  if (await keyUsed(payload, key)) return done('already-saved')
  try {
    return await inTransaction(payload, async (req): Promise<ActionResult> => {
      if (!(await lockItems(payload, req, [v.value.itemId]))) return fail('not-found')
      const item = (await payload.findByID({ collection: 'stock-items', id: v.value.itemId, depth: 0, overrideAccess: true, req: req as PayloadRequest })) as unknown as Doc
      if (item.active === false) return fail('item-inactive')
      const hand = (await onHandMap(payload, [v.value.itemId], req)).get(v.value.itemId) ?? 0
      if (hand - v.value.qty < 0 && !v.value.anyway) return fail('not-enough')
      const returnable = typeof item.returnable === 'boolean' ? item.returnable : returnableByDefault(item.category)
      const issue = await create(payload, req, { collection: 'stock-issues', data: { item: v.value.itemId, member: v.value.memberId, qty: v.value.qty, issuedOn: noon(v.value.issuedOn), dueBackOn: v.value.dueBackOn ? noon(v.value.dueBackOn) : null, returnable, note: v.value.note || null, recordedBy: user.id } })
      await create(payload, req, { collection: 'stock-movements', data: { item: v.value.itemId, kind: 'issued', qty: v.value.qty, date: noon(v.value.issuedOn), member: v.value.memberId, issue: issue.id, note: v.value.note || null, idempotencyKey: key, recordedBy: user.id } })
      return done('issued')
    })
  } catch (err) {
    if (await keyUsed(payload, key).catch(() => false)) return done('already-saved')
    console.warn('[office] issue stock failed:', (err as Error).message)
    return fail('save')
  }
}

async function settle(user: TypedUser, raw: Parameters<typeof validateSettle>[0] & { nonce?: unknown }, kind: 'returned' | 'lost'): Promise<ActionResult> {
  const v = validateSettle(raw)
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  const key = cleanNonce(raw.nonce)
  const notice: StockNotice = kind === 'returned' ? 'returned' : 'lost'
  if (await keyUsed(payload, key)) return done('already-saved')
  const first = (await payload.findByID({ collection: 'stock-issues', id: v.value.issueId, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Doc | null
  const itemId = first ? idOf(first.item) : null
  if (!first || itemId === null) return fail('not-found')
  try {
    return await inTransaction(payload, async (req): Promise<ActionResult> => {
      if (!(await lockItems(payload, req, [itemId]))) return fail('not-found')
      const issueDoc = (await payload.findByID({ collection: 'stock-issues', id: v.value.issueId, depth: 0, overrideAccess: true, req: req as PayloadRequest })) as unknown as Doc
      const issue = issueRow(issueDoc)
      if (issue.voided) return fail('not-found')
      if (!issue.returnable) return fail('not-returnable')
      const moves = (await payload.find({ collection: 'stock-movements', where: { and: [{ issue: { equals: issue.id } }, { voidedAt: { exists: false } }, { kind: { in: ['returned', 'lost'] } }] }, pagination: false, depth: 0, overrideAccess: true, req: req as PayloadRequest })).docs as unknown as Doc[]
      const settlements: IssueSettlement[] = moves.map((m) => ({ issueId: issue.id, kind: m.kind === 'lost' ? 'lost' : 'returned', qty: num(m.qty) }))
      const { owed } = issueStanding(issue, settlements, currentClubDate())
      if (v.value.qty > owed) return fail('too-many')
      await create(payload, req, { collection: 'stock-movements', data: { item: itemId, kind, qty: v.value.qty, date: noon(currentClubDate()), member: issue.memberId, issue: issue.id, note: v.value.note || null, idempotencyKey: key, recordedBy: user.id } })
      return done(notice)
    })
  } catch (err) {
    if (await keyUsed(payload, key).catch(() => false)) return done('already-saved')
    console.warn('[office] settle stock issue failed:', (err as Error).message)
    return fail('save')
  }
}

/** A return, whole or part. Never more than the person still holds. */
export async function returnStock(user: unknown, raw: Parameters<typeof validateSettle>[0] & { nonce?: unknown }): Promise<ActionResult> {
  return staffOnly(user) ? settle(user, raw, 'returned') : fail('forbidden')
}

/** Marks some of what a person holds as lost. It settles what they owed and does not take stock away a second time. */
export async function markLost(user: unknown, raw: Parameters<typeof validateSettle>[0] & { nonce?: unknown }): Promise<ActionResult> {
  return staffOnly(user) ? settle(user, raw, 'lost') : fail('forbidden')
}

/** Stock that is gone without being issued: lost from the store, or worn out. Refuses to take the count below zero. */
export async function removeStock(user: unknown, raw: Parameters<typeof validateRemove>[0] & { nonce?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const v = validateRemove(raw)
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  const key = cleanNonce(raw.nonce)
  if (await keyUsed(payload, key)) return done('already-saved')
  try {
    return await inTransaction(payload, async (req): Promise<ActionResult> => {
      if (!(await lockItems(payload, req, [v.value.itemId]))) return fail('not-found')
      const hand = (await onHandMap(payload, [v.value.itemId], req)).get(v.value.itemId) ?? 0
      if (hand - v.value.qty < 0) return fail('not-enough')
      await create(payload, req, { collection: 'stock-movements', data: { item: v.value.itemId, kind: v.value.kind, qty: v.value.qty, date: noon(currentClubDate()), note: v.value.note || null, idempotencyKey: key, recordedBy: user.id } })
      return done('removed')
    })
  } catch (err) {
    if (await keyUsed(payload, key).catch(() => false)) return done('already-saved')
    console.warn('[office] remove stock failed:', (err as Error).message)
    return fail('save')
  }
}

/**
 * Voids one movement with a reason (history stays, the count is put back). Refuses when it would take the count below zero, and
 * refuses to void an issue that has returns or losses against it. Voiding an issue's movement voids the issue too.
 */
export async function voidMovement(user: unknown, raw: { id: unknown; reason: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const v = validateStockVoid(raw)
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  const first = (await payload.findByID({ collection: 'stock-movements', id: v.value.id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Doc | null
  const itemId = first ? idOf(first.item) : null
  if (!first || itemId === null) return fail('not-found')
  try {
    return await inTransaction(payload, async (req): Promise<ActionResult> => {
      if (!(await lockItems(payload, req, [itemId]))) return fail('not-found')
      const m = (await payload.findByID({ collection: 'stock-movements', id: v.value.id, depth: 0, overrideAccess: true, req: req as PayloadRequest })) as unknown as Doc
      if (m.voidedAt) return fail('not-found')
      const kind = m.kind as MovementKind
      const issueId = idOf(m.issue)
      const delta = movementDelta(kind, num(m.qty), issueId)
      const hand = (await onHandMap(payload, [itemId], req)).get(itemId) ?? 0
      // Taking the movement back changes the count by -delta. A void that lowers the count must not leave it below zero.
      if (delta > 0 && hand - delta < 0) return fail('would-go-negative')
      const stamp = { voidedAt: new Date().toISOString(), voidedBy: user.id, voidReason: v.value.reason }
      if (kind === 'issued' && issueId) {
        const linked = await payload.count({ collection: 'stock-movements', where: { and: [{ issue: { equals: issueId } }, { voidedAt: { exists: false } }, { kind: { in: ['returned', 'lost'] } }] }, overrideAccess: true, req: req as PayloadRequest })
        if (linked.totalDocs > 0) return fail('has-returns')
        await payload.update({ collection: 'stock-issues', id: issueId, data: stamp as never, overrideAccess: true, depth: 0, req: req as PayloadRequest })
      }
      await payload.update({ collection: 'stock-movements', id: v.value.id, data: stamp as never, overrideAccess: true, depth: 0, req: req as PayloadRequest })
      return done('voided')
    })
  } catch (err) {
    console.warn('[office] void stock movement failed:', (err as Error).message)
    return fail('save')
  }
}

/** Posts the stocktake: one adjustment per item whose count differs. Refuses if the stock moved since the counts were typed. */
export async function postStocktake(user: unknown, input: { counts: Count[]; nonce?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  if (!input.counts.length) return fail('nothing')
  const payload = await getPayloadClient()
  const key = cleanNonce(input.nonce)
  if (key && (await payload.count({ collection: 'stock-movements', where: { idempotencyKey: { like: `${key}:` } }, overrideAccess: true })).totalDocs > 0) return done('already-saved')
  try {
    return await inTransaction(payload, async (req): Promise<ActionResult> => {
      const ids = input.counts.map((c) => c.itemId)
      if (!(await lockItems(payload, req, ids))) return fail('not-found')
      const hand = await onHandMap(payload, ids, req)
      if (input.counts.some((c) => (hand.get(c.itemId) ?? 0) !== c.expected)) return fail('changed')
      const deltas = stocktakeDeltas(input.counts)
      if (!deltas.length) return done('stocktake-none')
      for (const d of deltas) {
        await create(payload, req, { collection: 'stock-movements', data: { item: d.itemId, kind: 'adjustment', qty: d.delta, date: noon(currentClubDate()), note: 'Stocktake', idempotencyKey: key ? `${key}:${d.itemId}` : null, recordedBy: user.id } })
      }
      return done('stocktake', deltas.length)
    })
  } catch (err) {
    console.warn('[office] stocktake failed:', (err as Error).message)
    return fail('save')
  }
}

// ---- export -----------------------------------------------------------------------------------------------------------------

export const OWED_EXPORT_SUMMARY_SPEC = { scope: ['owed'] } as const

/** The owed list as a table with names. Called only from `auditedExport`, after the admin check, and checks again. */
export async function owedExportTable(user: TypedUser): Promise<{ header: string[]; rows: (string | number)[][] }> {
  if (!isAdminUser(user as never)) throw new Error('admin only')
  const { OWED_HEADER, ISSUE_STATUS_LABEL } = await import('./office/stock')
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const [items, ledger] = await Promise.all([loadItems(payload), loadLedger(payload)])
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const lines = owedLines(ledger.issues, ledger.settlements, today)
  const names = await fullNamesFor(payload, lines.map((l) => l.issue.memberId).filter((x): x is number => x !== null))
  const rows = lines.map((l) => {
    const item = itemMap.get(l.issue.itemId)
    return [l.issue.memberId ? (names.get(l.issue.memberId) ?? 'Former member') : 'Former member', item?.name ?? 'Removed item', item?.size ?? '', l.owed, l.issue.issuedOn, l.issue.dueBackOn ?? '', l.daysOverdue, l.overdue ? (l.status === 'part-returned' ? 'Overdue, part returned' : 'Overdue') : ISSUE_STATUS_LABEL[l.status]]
  })
  return { header: [...OWED_HEADER], rows }
}

export { parseStockId }
