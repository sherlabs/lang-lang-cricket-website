/**
 * Match fees (wave D spec section 4.2). Pure: charges, waivers and payments in, a settlement per charge and a credit out. No clock,
 * no database, no currency. Money is integer cents.
 *
 * Order of events: charges are sorted oldest first; waivers reduce what is payable; payments that name a target settle only that
 * target (anything beyond it is held as credit, never spent on other debts); then the remaining untargeted money forms one pool for
 * the member that settles the oldest debt first, and what is left is credit that rolls forward.
 */
export type ChargeKind = 'season' | 'game' | 'adjustment'

export type Charge = {
  /** Stable id: `season:<name>` and `game:<matchId>` for derived charges, the stored row id for closed seasons. */
  id: string
  kind: ChargeKind
  /** YYYY-MM-DD. */
  date: string
  season: string
  amountCents: number
  matchId?: string
  description: string
}

export type Waiver = {
  id: string
  scope: 'game' | 'season' | 'amount'
  matchId?: string
  season?: string
  amountCents?: number
  voided?: boolean
}

export type PaymentTarget = { kind: 'season'; season: string } | { kind: 'charge'; chargeId?: string; matchId?: string }

export type Payment = {
  id: string
  amountCents: number
  /** YYYY-MM-DD. */
  receivedOn: string
  appliesTo?: PaymentTarget | null
  voided?: boolean
}

export type ChargeStatus = 'paid' | 'part-paid' | 'owing' | 'waived' | 'not-charged'
export const STATUS_LABEL: Record<ChargeStatus, string> = { paid: 'Paid', 'part-paid': 'Part paid', owing: 'Owing', waived: 'Waived', 'not-charged': 'Not charged' }
/** Text symbol beside the word, so status never rests on colour alone. */
export const STATUS_MARK: Record<ChargeStatus, string> = { paid: '✓', 'part-paid': '◐', owing: '!', waived: '−', 'not-charged': '–' }

export type ChargeLine = Charge & {
  waivedCents: number
  payableCents: number
  /** Everything applied to this charge: targeted plus pool. */
  paidCents: number
  /** The part of `paidCents` that came from payments aimed at this charge or its season. */
  paidTargetedCents: number
  owedCents: number
  status: ChargeStatus
}

export type Allocation = {
  lines: ChargeLine[]
  /** Money held: untargeted money not needed for any debt, plus the excess of targeted payments. Rolls forward. */
  creditCents: number
  totalPaymentsCents: number
}

const byDateThenId = (a: { date: string; id: string }, b: { date: string; id: string }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function statusOf(payable: number, waived: number, paid: number, owed: number): ChargeStatus {
  if (payable === 0) return waived > 0 ? 'waived' : 'not-charged'
  if (owed === 0) return 'paid'
  return paid > 0 ? 'part-paid' : 'owing'
}

export function allocate(chargesIn: readonly Charge[], waiversIn: readonly Waiver[], paymentsIn: readonly Payment[]): Allocation {
  const charges = [...chargesIn].filter((c) => c.amountCents > 0).sort(byDateThenId)
  const waived = new Map<string, number>(charges.map((c) => [c.id, 0]))
  const paid = new Map<string, number>(charges.map((c) => [c.id, 0]))
  const targeted = new Map<string, number>(charges.map((c) => [c.id, 0]))
  const payableOf = (c: Charge) => c.amountCents - (waived.get(c.id) ?? 0)
  const owedOf = (c: Charge) => payableOf(c) - (paid.get(c.id) ?? 0)

  // 2. Waivers. Game and season waivers zero their charges; amount waivers reduce the oldest payable charges first.
  const waivers = waiversIn.filter((w) => !w.voided).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const w of waivers) {
    if (w.scope === 'game') {
      for (const c of charges) if (c.kind === 'game' && w.matchId && c.matchId === w.matchId) waived.set(c.id, c.amountCents)
    } else if (w.scope === 'season') {
      for (const c of charges) if ((c.kind === 'game' || c.kind === 'season') && c.season === w.season) waived.set(c.id, c.amountCents)
    }
  }
  for (const w of waivers) {
    if (w.scope !== 'amount') continue
    let left = Math.max(0, w.amountCents ?? 0)
    for (const c of charges) {
      if (left === 0) break
      if (w.season && c.season !== w.season) continue
      const take = Math.min(left, payableOf(c))
      waived.set(c.id, (waived.get(c.id) ?? 0) + take)
      left -= take
    }
  }

  // 3. Targeted payments settle only their target; excess is held as credit.
  const payments = paymentsIn.filter((p) => !p.voided && p.amountCents > 0).sort((a, b) => (a.receivedOn < b.receivedOn ? -1 : a.receivedOn > b.receivedOn ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  let credit = 0
  let pool = 0
  let total = 0
  for (const p of payments) {
    total += p.amountCents
    const t = p.appliesTo
    if (!t) {
      pool += p.amountCents
      continue
    }
    const targets = t.kind === 'season' ? charges.filter((c) => c.season === t.season) : charges.filter((c) => (t.chargeId && c.id === t.chargeId) || (t.matchId && c.matchId === t.matchId))
    let left = p.amountCents
    for (const c of targets) {
      if (left === 0) break
      const take = Math.min(left, owedOf(c))
      if (take <= 0) continue
      paid.set(c.id, (paid.get(c.id) ?? 0) + take)
      targeted.set(c.id, (targeted.get(c.id) ?? 0) + take)
      left -= take
    }
    credit += left
  }

  // 4. The general pool settles what is still owed, oldest first.
  for (const c of charges) {
    if (pool === 0) break
    const take = Math.min(pool, owedOf(c))
    if (take <= 0) continue
    paid.set(c.id, (paid.get(c.id) ?? 0) + take)
    pool -= take
  }
  credit += pool

  const lines = charges.map((c): ChargeLine => {
    const w = waived.get(c.id) ?? 0
    const p = paid.get(c.id) ?? 0
    const payable = c.amountCents - w
    const owed = payable - p
    return { ...c, waivedCents: w, payableCents: payable, paidCents: p, paidTargetedCents: targeted.get(c.id) ?? 0, owedCents: owed, status: statusOf(payable, w, p, owed) }
  })
  return { lines, creditCents: credit, totalPaymentsCents: total }
}

/** Per-season sums of an allocation, the numbers one report row shows. */
export type SeasonTotals = { payableCents: number; paidCents: number; paidSpecificCents: number; waivedCents: number; owedCents: number }
export function totalsForSeason(lines: readonly ChargeLine[], season: string): SeasonTotals {
  const t: SeasonTotals = { payableCents: 0, paidCents: 0, paidSpecificCents: 0, waivedCents: 0, owedCents: 0 }
  for (const l of lines) {
    if (l.season !== season) continue
    t.payableCents += l.payableCents
    t.paidCents += l.paidCents
    t.paidSpecificCents += l.paidTargetedCents
    t.waivedCents += l.waivedCents
    t.owedCents += l.owedCents
  }
  return t
}

// ---- derived charges for an open season --------------------------------------------------------------------------------------

export type MembershipInput = { season: string; joinedOn?: string | null; upfrontCents: number; perMatchCents: number }
export type AppearanceInput = { matchId: string; date: string; label: string; isFillIn?: boolean; isRegisteredPlayer?: boolean }

/**
 * Charges for one member in one open season, from the membership's frozen rates and the games they played. The membership fee is
 * dated when they joined (or the season start). A fill-in is charged only when they are a registered player or the club's
 * `chargeFillIns` setting is on. A free tier (both rates zero) produces nothing.
 */
export function deriveCharges(m: MembershipInput, seasonStart: string, appearances: readonly AppearanceInput[], chargeFillIns: boolean): Charge[] {
  const out: Charge[] = []
  if (m.upfrontCents > 0) out.push({ id: `season:${m.season}`, kind: 'season', date: (m.joinedOn ?? seasonStart).slice(0, 10), season: m.season, amountCents: m.upfrontCents, description: `Membership ${m.season}` })
  if (m.perMatchCents > 0) {
    const seen = new Set<string>()
    for (const a of appearances) {
      if (seen.has(a.matchId)) continue
      seen.add(a.matchId)
      if (a.isFillIn && !a.isRegisteredPlayer && !chargeFillIns) continue
      out.push({ id: `game:${a.matchId}`, kind: 'game', date: a.date.slice(0, 10), season: m.season, amountCents: m.perMatchCents, matchId: a.matchId, description: a.label })
    }
  }
  return out
}

// ---- households --------------------------------------------------------------------------------------------------------------

/** The connected set of members linked by `guardians` edges in either direction (a child, their guardians, and siblings through them). */
export function householdFor(memberId: number, guardians: ReadonlyMap<number, readonly number[]>): number[] {
  const adj = new Map<number, Set<number>>()
  const link = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const [child, gs] of guardians) for (const g of gs) link(child, g)
  const seen = new Set<number>([memberId])
  const queue = [memberId]
  while (queue.length) {
    const cur = queue.pop()!
    for (const n of adj.get(cur) ?? []) if (!seen.has(n)) {
      seen.add(n)
      queue.push(n)
    }
  }
  return [...seen].sort((a, b) => a - b)
}

/** Every household as a sorted id list, one per connected set (members with no links are their own household). */
export function allHouseholds(memberIds: readonly number[], guardians: ReadonlyMap<number, readonly number[]>): number[][] {
  const done = new Set<number>()
  const out: number[][] = []
  for (const id of [...memberIds].sort((a, b) => a - b)) {
    if (done.has(id)) continue
    const h = householdFor(id, guardians)
    for (const x of h) done.add(x)
    out.push(h)
  }
  return out
}
