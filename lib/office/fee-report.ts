import { allHouseholds, allocate, deriveCharges, totalsForSeason, type Allocation, type AppearanceInput, type Charge, type Payment, type SeasonTotals, type Waiver } from './fees'
import { seasonRange } from './season'

/**
 * The fee model and the treasurer report (wave D spec 4.2 and 4.4). Pure: the data layer loads plain rows into a `FeeModel` and
 * everything below is arithmetic over it, so the report, the member ledger and the CSV cannot disagree and every rule is testable
 * without a database. Charges for an open season are worked out from the games each member played; charges for a closed season are
 * the stored rows and are never re-derived.
 */
export type FeeMember = { id: number; name: string; roles?: string[]; playerId: number | null; status: 'active' | 'past'; erased: boolean; guardianIds: number[] }
export type FeeMembership = { memberId: number; season: string; tierName: string; joinedOn?: string | null; upfrontCents: number; perMatchCents: number }
export type FeeAppearance = AppearanceInput & { playerId: number }
export type StoredCharge = Charge & { memberId: number; voided?: boolean }
export type FeePayment = Payment & { memberId: number; payerId: number | null; splitGroup?: string | null; method?: string; reference?: string | null; note?: string | null }
export type FeeWaiver = Waiver & { memberId: number; note?: string | null }

export type FeeModel = {
  members: FeeMember[]
  memberships: FeeMembership[]
  closedSeasons: ReadonlySet<string>
  stored: StoredCharge[]
  appearances: FeeAppearance[]
  payments: FeePayment[]
  waivers: FeeWaiver[]
  chargeFillIns: boolean
  /** Club-side appearances in games of the season with no linked player: they cannot be charged. */
  unmatchedAppearances: number
  /** Games players were recorded in (season totals) that are not in the match store, for members with a membership. */
  missingFromStore: number
}

const sorted = <T,>(xs: readonly T[], key: (x: T) => string): T[] => [...xs].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))

/** All charges for one member: derived for each membership in an open season, plus stored rows of closed seasons. */
export function chargesFor(model: FeeModel, memberId: number): Charge[] {
  const member = model.members.find((m) => m.id === memberId)
  const out: Charge[] = []
  for (const ms of model.memberships) {
    if (ms.memberId !== memberId || model.closedSeasons.has(ms.season)) continue
    const range = seasonRange(ms.season)
    if (!range) continue
    const games = member?.playerId == null ? [] : model.appearances.filter((a) => a.playerId === member.playerId && a.date.slice(0, 10) >= range.from && a.date.slice(0, 10) <= range.to)
    out.push(...deriveCharges({ season: ms.season, joinedOn: ms.joinedOn, upfrontCents: ms.upfrontCents, perMatchCents: ms.perMatchCents }, range.from, games, model.chargeFillIns))
  }
  for (const c of model.stored) if (c.memberId === memberId && !c.voided && model.closedSeasons.has(c.season)) out.push(c)
  return out
}

export function ledgerFor(model: FeeModel, memberId: number): Allocation {
  return allocate(
    chargesFor(model, memberId),
    model.waivers.filter((w) => w.memberId === memberId),
    model.payments.filter((p) => p.memberId === memberId),
  )
}

export type ReportRow = SeasonTotals & { memberId: number; name: string; tier: string; creditCents: number; householdKey: number }
export type HouseholdRow = SeasonTotals & { key: number; names: string[]; creditCents: number; memberIds: number[] }
export type FeeReport = {
  season: string
  closed: boolean
  rows: ReportRow[]
  households: HouseholdRow[]
  totals: SeasonTotals & { creditCents: number }
  unmatchedAppearances: number
  missingFromStore: number
  incomplete: boolean
  /** Closed seasons only: what match data would give today versus the stored total, when they differ. */
  drift: { derivedCents: number; storedCents: number } | null
}

/** In-memory total of what the open-season rules would charge for a season, ignoring whether it is closed (for the drift warning and Close season). */
export function derivedSeasonTotal(model: FeeModel, season: string): number {
  const open: FeeModel = { ...model, closedSeasons: new Set([...model.closedSeasons].filter((s) => s !== season)) }
  let total = 0
  for (const ms of model.memberships) if (ms.season === season) for (const c of chargesFor(open, ms.memberId)) if (c.season === season && !c.id.startsWith('adjustment')) total += c.amountCents
  return total
}

/** Derived charges for a season for Close season: the rows to store, tagged by member. */
export function chargesToStore(model: FeeModel, season: string): { memberId: number; charge: Charge }[] {
  const open: FeeModel = { ...model, closedSeasons: new Set([...model.closedSeasons].filter((s) => s !== season)) }
  const out: { memberId: number; charge: Charge }[] = []
  for (const ms of sorted(model.memberships.filter((m) => m.season === season), (m) => String(m.memberId).padStart(10, '0'))) {
    for (const c of chargesFor(open, ms.memberId)) if (c.season === season) out.push({ memberId: ms.memberId, charge: c })
  }
  return out
}

export function feeReport(model: FeeModel, season: string): FeeReport {
  const closed = model.closedSeasons.has(season)
  const inSeason = new Set<number>()
  for (const ms of model.memberships) if (ms.season === season) inSeason.add(ms.memberId)
  for (const c of model.stored) if (c.season === season && !c.voided) inSeason.add(c.memberId)
  const rows: ReportRow[] = []
  const guardians = new Map<number, number[]>(model.members.map((m) => [m.id, m.guardianIds]))
  const households = allHouseholds([...inSeason], guardians)
  const keyOf = new Map<number, number>()
  for (const h of households) for (const id of h) keyOf.set(id, h[0])
  for (const m of sorted(model.members, (x) => x.name.toLowerCase())) {
    // Archived members are left out (the page says so); a person whose details were removed stays, as "Former member".
    if (!inSeason.has(m.id) || (m.status === 'past' && !m.erased)) continue
    const alloc = ledgerFor(model, m.id)
    const t = totalsForSeason(alloc.lines, season)
    const ms = model.memberships.find((x) => x.memberId === m.id && x.season === season)
    rows.push({ ...t, memberId: m.id, name: m.name, tier: ms?.tierName ?? '', creditCents: alloc.creditCents, householdKey: keyOf.get(m.id) ?? m.id })
  }
  const hh = new Map<number, HouseholdRow>()
  for (const r of rows) {
    const h = hh.get(r.householdKey) ?? { key: r.householdKey, names: [], memberIds: [], creditCents: 0, payableCents: 0, paidCents: 0, paidSpecificCents: 0, waivedCents: 0, owedCents: 0 }
    h.names.push(r.name)
    h.memberIds.push(r.memberId)
    h.creditCents += r.creditCents
    h.payableCents += r.payableCents
    h.paidCents += r.paidCents
    h.paidSpecificCents += r.paidSpecificCents
    h.waivedCents += r.waivedCents
    h.owedCents += r.owedCents
    hh.set(r.householdKey, h)
  }
  const totals = rows.reduce(
    (a, r) => ({ payableCents: a.payableCents + r.payableCents, paidCents: a.paidCents + r.paidCents, paidSpecificCents: a.paidSpecificCents + r.paidSpecificCents, waivedCents: a.waivedCents + r.waivedCents, owedCents: a.owedCents + r.owedCents, creditCents: a.creditCents + r.creditCents }),
    { payableCents: 0, paidCents: 0, paidSpecificCents: 0, waivedCents: 0, owedCents: 0, creditCents: 0 },
  )
  let drift: FeeReport['drift'] = null
  if (closed) {
    const storedCents = model.stored.filter((c) => c.season === season && !c.voided && c.kind !== 'adjustment').reduce((s, c) => s + c.amountCents, 0)
    const derivedCents = derivedSeasonTotal(model, season)
    if (derivedCents !== storedCents) drift = { derivedCents, storedCents }
  }
  const incomplete = !closed && (model.unmatchedAppearances > 0 || model.missingFromStore > 0)
  return { season, closed, rows, households: [...hh.values()], totals, unmatchedAppearances: model.unmatchedAppearances, missingFromStore: model.missingFromStore, incomplete, drift }
}

/** Owing across the open season(s) for the dashboard line: members who owe something, and the total. Archived members are not counted. */
export function owingSummary(model: FeeModel, openSeasons: readonly string[]): { members: number; owedCents: number } {
  let members = 0
  let owedCents = 0
  const counted = new Set<number>()
  for (const season of openSeasons) {
    for (const r of feeReport(model, season).rows) {
      if (r.owedCents > 0 && !counted.has(r.memberId)) {
        counted.add(r.memberId)
        members++
      }
      owedCents += r.owedCents
    }
  }
  return { members, owedCents }
}

/** Plain list of what a prospective payment would settle, comparing the allocation before and after. */
export function previewPayment(model: FeeModel, memberId: number, payment: Payment): { settles: { description: string; addedCents: number; becomes: string }[]; creditBefore: number; creditAfter: number } {
  const before = ledgerFor(model, memberId)
  const after = allocate(chargesFor(model, memberId), model.waivers.filter((w) => w.memberId === memberId), [...model.payments.filter((p) => p.memberId === memberId), payment])
  const prev = new Map(before.lines.map((l) => [l.id, l]))
  const settles = after.lines
    .map((l) => ({ description: l.description, addedCents: l.paidCents - (prev.get(l.id)?.paidCents ?? 0), becomes: l.status }))
    .filter((s) => s.addedCents > 0)
  return { settles, creditBefore: before.creditCents, creditAfter: after.creditCents }
}
