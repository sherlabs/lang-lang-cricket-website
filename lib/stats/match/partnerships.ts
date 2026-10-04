import type { DismissalType } from '@/lib/playhq/match-rows'
import { PARTNERSHIP_REASONS, type PartnershipFact, type PartnershipReason } from './types'

/**
 * Partnerships inferred from batting order plus fall of wickets (W2 spec 2.4). PlayHQ gives no
 * partner identity, so a pair is `inferred`, never exact: the scorer's card order stands in for
 * arrival order, and an innings that does not validate is rejected (counted, never repaired).
 * Partnership runs are team-score differences, so they include extras; no per-batter share exists.
 */
export type PartnershipRow = {
  /** The visible club player, or null for a hidden or unresolved one (still needed to pair the innings). */
  player: number | null
  position: number
  status: 'out' | 'not_out' | 'unknown'
  dismissal: DismissalType | null
  fowWicket: number | null
  fowRuns: number | null
}

export type PartnershipInput = {
  hasFow: boolean
  allOut: boolean
  totalRuns: number | null
  totalWickets: number | null
  /** Batting rows of the club innings with `battingStatus != did_not_bat`, any order. */
  rows: readonly PartnershipRow[]
}

export type DerivedPartnership = Omit<PartnershipFact, 'm' | 'seq'>
export type PartnershipResult = { pairs: DerivedPartnership[]; unavailable: PartnershipReason | null }

const RETIRED = new Set<DismissalType>(['retired', 'retired_hurt', 'retired_out'])
const fail = (r: PartnershipReason): PartnershipResult => ({ pairs: [], unavailable: r })

export function derivePartnerships(input: PartnershipInput): PartnershipResult {
  if (!input.hasFow) return fail('no_fow')
  const rows = [...input.rows].sort((a, b) => a.position - b.position)
  if (rows.some((r) => r.dismissal !== null && RETIRED.has(r.dismissal))) return fail('retirement')
  const positions = rows.map((r) => r.position)
  if (positions.some((p) => !(p > 0)) || new Set(positions).size !== positions.length || rows.length < 2) return fail('bad_position')

  // The dismissal state must be known for every batter, and fow entries must pair one-to-one with out rows.
  if (rows.some((r) => r.status === 'unknown')) return fail('fow_missing_for_out')
  if (rows.some((r) => (r.status === 'out') !== (r.fowWicket !== null))) return fail('fow_missing_for_out')
  const withFow = rows.filter((r) => r.fowWicket !== null)
  const n = withFow.length
  const wickets = withFow.map((r) => r.fowWicket as number).sort((a, b) => a - b)
  if (wickets.some((w, i) => w !== i + 1)) return fail('fow_gap')
  if (n !== input.totalWickets) return fail('total_mismatch')
  const byWicket = new Map(withFow.map((r) => [r.fowWicket as number, r]))
  let prevRuns = 0
  for (let k = 1; k <= n; k++) {
    const runs = byWicket.get(k)!.fowRuns
    if (runs === null || runs < prevRuns) return fail('fow_runs_decrease')
    prevRuns = runs
  }

  const pairs: DerivedPartnership[] = []
  let crease: [PartnershipRow | null, PartnershipRow | null] = [rows[0], rows[1]]
  let next = 2
  prevRuns = 0
  for (let k = 1; k <= n; k++) {
    const out = byWicket.get(k)!
    const slot = crease[0] === out ? 0 : crease[1] === out ? 1 : -1
    if (slot < 0) return fail('crease_mismatch')
    const partner = crease[slot === 0 ? 1 : 0]
    if (!partner) return fail('crease_mismatch')
    const runs = out.fowRuns as number
    pairs.push({ wicket: k, runs: runs - prevRuns, a: out.player, b: partner.player, unbroken: false })
    prevRuns = runs
    const incoming = rows[next] ?? null
    if (incoming) next++
    crease = slot === 0 ? [incoming, crease[1]] : [crease[0], incoming]
  }

  // Unbroken last stand: only a not-out pair that is still at the crease, in an innings that did not end all out.
  const [x, y] = crease
  if (!input.allOut && x && y && x.status === 'not_out' && y.status === 'not_out' && input.totalRuns !== null) {
    const runs = input.totalRuns - prevRuns
    if (runs < 0) return fail('fow_runs_decrease')
    pairs.push({ wicket: n + 1, runs, a: x.player, b: y.player, unbroken: true })
  }
  return { pairs, unavailable: null }
}

/** Plain-English reason for the caption. */
export const REASON_TEXT: Record<PartnershipReason, string> = {
  no_fow: 'no fall of wickets',
  retirement: 'retirement',
  bad_position: 'unreliable batting order',
  fow_gap: 'missing fall of wicket number',
  fow_missing_for_out: 'dismissal without a fall of wicket',
  fow_runs_decrease: 'fall of wicket runs out of order',
  crease_mismatch: 'batters do not pair up',
  total_mismatch: 'wickets do not match the total',
}
export { PARTNERSHIP_REASONS }

/** "3 of 20 innings unavailable (2 retirement, 1 missing fall of wicket number)". Null when none. */
export function unavailableText(reasons: Partial<Record<PartnershipReason, number>>, total: number): string | null {
  const parts = PARTNERSHIP_REASONS.flatMap((r) => ((reasons[r] ?? 0) > 0 ? [`${reasons[r]} ${REASON_TEXT[r]}`] : []))
  const k = Object.values(reasons).reduce<number>((a, b) => a + (b ?? 0), 0)
  return k > 0 ? `${k} of ${total} innings unavailable (${parts.join(', ')})` : null
}

/** A pair is public only when both partners are visible club players. */
export const isPublicPair = (p: Pick<PartnershipFact, 'a' | 'b'>): p is { a: number; b: number } => p.a !== null && p.b !== null

export type PlayerPartnershipView = {
  /** Pairs with a visible partner, newest first by the caller. */
  withVisible: (PartnershipFact & { partner: number })[]
  /** Pairs whose partner is hidden or unresolved: only an anonymous count and best. */
  others: { count: number; best: number }
  /** Per-partner shared stands, for "most successful partner". */
  byPartner: { partner: number; stands: number; runs: number; best: number }[]
}

export function partnershipsForPlayer(all: readonly PartnershipFact[], playerId: number): PlayerPartnershipView {
  const withVisible: PlayerPartnershipView['withVisible'] = []
  const others = { count: 0, best: 0 }
  const by = new Map<number, { stands: number; runs: number; best: number }>()
  for (const p of all) {
    if (p.a !== playerId && p.b !== playerId) continue
    const partner = p.a === playerId ? p.b : p.a
    if (partner === null || partner === playerId) {
      others.count++
      others.best = Math.max(others.best, p.runs)
      continue
    }
    withVisible.push({ ...p, partner })
    const e = by.get(partner) ?? { stands: 0, runs: 0, best: 0 }
    e.stands++
    e.runs += p.runs
    e.best = Math.max(e.best, p.runs)
    by.set(partner, e)
  }
  const byPartner = [...by].map(([partner, e]) => ({ partner, ...e })).sort((a, b) => b.runs - a.runs || b.stands - a.stands || a.partner - b.partner)
  return { withVisible, others, byPartner }
}

/** Best public pair at each wicket number (1 to 10), ties broken by the pair seen first in input order. */
export function bestByWicket(all: readonly PartnershipFact[], maxWicket = 10): Map<number, PartnershipFact> {
  const best = new Map<number, PartnershipFact>()
  for (const p of all) {
    if (!isPublicPair(p) || p.wicket > maxWicket) continue
    const cur = best.get(p.wicket)
    if (!cur || p.runs > cur.runs) best.set(p.wicket, p)
  }
  return best
}

/** The `n` best public pairs overall (competition ranking, so tied stands share a rank). */
export function topPartnerships(all: readonly PartnershipFact[], n: number): { rank: number; p: PartnershipFact }[] {
  const pub = all.filter(isPublicPair).sort((x, y) => y.runs - x.runs || x.wicket - y.wicket || x.m - y.m)
  let rank = 0
  return pub
    .map((p, i) => {
      if (i === 0 || p.runs !== pub[i - 1].runs) rank = i + 1
      return { rank, p }
    })
    .filter((x) => x.rank <= n)
    .slice(0, Math.max(n, 1) * 2)
}
