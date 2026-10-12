import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload, PayloadRequest } from 'payload'
import type { FeeAppearance, FeeMember, FeeModel, FeePayment, FeeWaiver, StoredCharge } from './fee-report'
import { chargesToStore } from './fee-report'
import type { PaymentTarget } from './fees'
import { displayNameFor } from './members'
import { seasonRange } from './season'

/**
 * Loading the fee model and closing a season, free of `server-only` and of the request, so the Fees pages, the actions and the demo
 * seed all use the same code. Callers have already checked that the person is an admin.
 */
type Doc = Record<string, unknown>
const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')
export const noon = (d: string): string => `${d}T12:00:00.000Z`

export type FeeTier = { id: number; season: string; name: string; kind: string; upfrontCents: number; perMatchCents: number; active: boolean; inUse: boolean }

/** Runs `fn` in one database transaction: every write it makes commits together or not at all. */
export async function inTransaction<T>(payload: Payload, fn: (req: Partial<PayloadRequest>) => Promise<T>): Promise<T> {
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) return fn({}) // the adapter has no transactions; single writes are still atomic
  try {
    const out = await fn({ transactionID } as Partial<PayloadRequest>)
    await payload.db.commitTransaction(transactionID)
    return out
  } catch (err) {
    await payload.db.rollbackTransaction(transactionID)
    throw err
  }
}

export type LoadedFees = { model: FeeModel; tiers: FeeTier[]; seasonsWithMemberships: string[] }

/**
 * Everything the arithmetic needs, as plain rows. `focus` names the seasons whose data-quality counts are wanted (default: every
 * open season that has memberships). Games come from the match store; a game is charged to the member whose linked player appears
 * on the club side.
 */
export async function loadFeeModel(payload: Payload, chargeFillIns: boolean, focus?: readonly string[]): Promise<LoadedFees> {
  const all = async (collection: 'members' | 'membership-tiers' | 'memberships' | 'fee-seasons' | 'fee-charges' | 'fee-payments' | 'fee-waivers', depth = 0) =>
    (await payload.find({ collection, pagination: false, depth, overrideAccess: true })).docs as unknown as Doc[]
  const [memberDocs, tierDocs, membershipDocs, seasonDocs, chargeDocs, paymentDocs, waiverDocs] = await Promise.all([all('members', 1), all('membership-tiers'), all('memberships'), all('fee-seasons'), all('fee-charges'), all('fee-payments'), all('fee-waivers')])

  const members: FeeMember[] = memberDocs.map((m) => {
    const player = m.player && typeof m.player === 'object' ? (m.player as Doc) : null
    const person = m.person && typeof m.person === 'object' ? (m.person as Doc) : null
    return {
      id: m.id as number,
      name: displayNameFor({ firstName: m.firstName as string, lastName: m.lastName as string, preferredName: m.preferredName as string, erasedAt: m.erasedAt as string, player, person: person as { name?: string } | null }),
      roles: ((m.roles as string[] | null) ?? []).map(String),
      playerId: idOf(m.player),
      status: m.status === 'past' ? 'past' : 'active',
      erased: Boolean(m.erasedAt),
      guardianIds: ((m.guardians as unknown[] | null) ?? []).map(idOf).filter((x): x is number => x !== null),
    }
  })
  const tierName = new Map(tierDocs.map((t) => [t.id as number, String(t.name ?? '')]))
  const usedTiers = new Set(membershipDocs.map((m) => idOf(m.tier)))
  const tiers: FeeTier[] = tierDocs.map((t) => ({ id: t.id as number, season: String(t.season), name: String(t.name), kind: String(t.kind), upfrontCents: Number(t.upfrontCents ?? 0), perMatchCents: Number(t.perMatchCents ?? 0), active: t.active !== false, inUse: usedTiers.has(t.id as number) }))
  const memberships = membershipDocs
    .filter((m) => idOf(m.member) !== null)
    .map((m) => ({
      memberId: idOf(m.member)!,
      season: String(m.season),
      tierName: tierName.get(idOf(m.tier) ?? -1) ?? '',
      joinedOn: typeof m.joinedOn === 'string' ? day(m.joinedOn) : null,
      upfrontCents: Number(m.upfrontCentsSnapshot ?? 0),
      perMatchCents: Number(m.perMatchCentsSnapshot ?? 0),
    }))
  const closedSeasons = new Set(seasonDocs.filter((s) => s.status === 'closed').map((s) => String(s.season)))
  const stored: StoredCharge[] = chargeDocs
    .filter((c) => idOf(c.member) !== null)
    .map((c) => ({ id: String(c.id), memberId: idOf(c.member)!, kind: c.kind as StoredCharge['kind'], date: day(c.date), season: String(c.season), amountCents: Number(c.amountCents), matchId: typeof c.matchId === 'string' && c.matchId ? c.matchId : undefined, description: String(c.description ?? ''), voided: Boolean(c.voidedAt) }))
  const target = (a: unknown): PaymentTarget | null => {
    const g = (a ?? {}) as Doc
    if (g.kind === 'season' && typeof g.season === 'string') return { kind: 'season', season: g.season }
    if (g.kind === 'charge') return { kind: 'charge', chargeId: typeof g.chargeId === 'string' && g.chargeId ? g.chargeId : undefined, matchId: typeof g.matchId === 'string' && g.matchId ? g.matchId : undefined }
    return null
  }
  const payments: FeePayment[] = paymentDocs
    .filter((p) => idOf(p.member) !== null)
    .map((p) => ({ id: String(p.id), memberId: idOf(p.member)!, payerId: idOf(p.payer), splitGroup: (p.splitGroup as string | null) ?? null, amountCents: Number(p.amountCents), receivedOn: day(p.receivedOn), method: String(p.method ?? ''), reference: (p.reference as string | null) ?? null, note: (p.note as string | null) ?? null, appliesTo: target(p.appliesTo), voided: Boolean(p.voidedAt) }))
  const waivers: FeeWaiver[] = waiverDocs
    .filter((w) => idOf(w.member) !== null)
    .map((w) => ({ id: String(w.id).padStart(10, '0'), memberId: idOf(w.member)!, scope: w.scope as FeeWaiver['scope'], matchId: (w.matchId as string | null) || undefined, season: (w.season as string | null) || undefined, amountCents: typeof w.amountCents === 'number' ? w.amountCents : undefined, note: (w.note as string | null) ?? null, voided: Boolean(w.voidedAt) }))

  const seasonsWithMemberships = [...new Set(memberships.map((m) => m.season))].sort().reverse()
  const wanted = focus ? [...focus] : seasonsWithMemberships.filter((s) => !closedSeasons.has(s))
  const openWanted = wanted.filter((s) => !closedSeasons.has(s))
  // Games are loaded for every season asked about (a closed one too, so the report can warn when match data has moved on); the
  // data-quality counts are for open seasons only.
  const ranges = wanted.map((s) => seasonRange(s)).filter((r): r is NonNullable<typeof r> => r !== null)
  let appearances: FeeAppearance[] = []
  let unmatchedAppearances = 0
  let missingFromStore = 0
  if (ranges.length) {
    const from = ranges.map((r) => r.from).sort()[0]
    const to = ranges.map((r) => r.to).sort().reverse()[0]
    const rows = await payload.db.drizzle.execute(
      sql`SELECT a.player_id, m.game_id, m.local_date, m.round_name, m.round_abbr, m.opponent_name, a.is_fill_in, a.is_registered_player
          FROM "payload"."match_appearances" a JOIN "payload"."matches" m ON m.id = a.match_id
          WHERE a.is_club_side = true AND a.player_id IS NOT NULL AND m.local_date >= ${from} AND m.local_date <= ${to}`,
    )
    appearances = (rows.rows as Doc[]).map((r) => ({
      playerId: Number(r.player_id),
      matchId: String(r.game_id),
      date: String(r.local_date).slice(0, 10),
      label: `${(r.round_abbr as string) || (r.round_name as string) || 'Game'}${r.opponent_name ? ` v ${r.opponent_name as string}` : ''}`,
      isFillIn: r.is_fill_in === true,
      isRegisteredPlayer: r.is_registered_player === true,
    }))
    for (const r of openWanted.map((s) => seasonRange(s)).filter((x): x is NonNullable<typeof x> => x !== null)) {
      const u = await payload.db.drizzle.execute(
        sql`SELECT count(*)::int AS n FROM "payload"."match_appearances" a JOIN "payload"."matches" m ON m.id = a.match_id
            WHERE a.is_club_side = true AND a.player_id IS NULL AND m.local_date >= ${r.from} AND m.local_date <= ${r.to}`,
      )
      unmatchedAppearances += (u.rows[0] as { n: number } | undefined)?.n ?? 0
    }
    // Games the players are recorded in (PlayHQ season totals) that the match store does not hold, for people with a membership.
    for (const s of openWanted) {
      const r = seasonRange(s)
      if (!r) continue
      const ids = members.filter((m) => m.playerId !== null && memberships.some((ms) => ms.memberId === m.id && ms.season === s)).map((m) => m.playerId as number)
      if (!ids.length) continue
      const inRange = new Map<number, Set<string>>()
      for (const a of appearances) if (a.date >= r.from && a.date <= r.to) inRange.set(a.playerId, (inRange.get(a.playerId) ?? new Set()).add(a.matchId))
      const ps = await payload.db.drizzle.execute(
        sql`SELECT player_id, sum(games)::int AS games FROM "payload"."player_seasons"
            WHERE player_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND COALESCE(season_start_year, NULLIF(substring(season_name from '\d{4}'), '')::int) = ${r.startYear}
            GROUP BY player_id`,
      )
      for (const row of ps.rows as { player_id: number; games: number }[]) missingFromStore += Math.max(0, Number(row.games) - (inRange.get(Number(row.player_id))?.size ?? 0))
    }
  }
  const model: FeeModel = { members, memberships, closedSeasons, stored, appearances, payments, waivers, chargeFillIns, unmatchedAppearances, missingFromStore }
  return { model, tiers, seasonsWithMemberships }
}

/**
 * Stores one charge per derived charge of `season` and marks it closed, in one transaction. The caller has checked the caller is an
 * admin, that the season is open and that unmatched games were accepted. Returns what was stored.
 */
export async function storeClosedSeason(payload: Payload, model: FeeModel, season: string, closedBy: number | null, closeAnyway: boolean): Promise<{ count: number; totalCents: number }> {
  const toStore = chargesToStore(model, season)
  const totalCents = toStore.reduce((s, x) => s + x.charge.amountCents, 0)
  await inTransaction(payload, async (req) => {
    const r = req as PayloadRequest
    for (const { memberId, charge } of toStore) {
      await payload.create({ collection: 'fee-charges', data: { member: memberId, season, kind: charge.kind, date: noon(charge.date), matchId: charge.matchId ?? null, amountCents: charge.amountCents, description: charge.description, closedAt: new Date().toISOString() } as never, overrideAccess: true, depth: 0, req: r })
    }
    const data = { season, status: 'closed', closedAt: new Date().toISOString(), closedBy, chargesTotalCents: totalCents, snapshotCount: toStore.length, closedAnyway: closeAnyway }
    const existing = await payload.find({ collection: 'fee-seasons', where: { season: { equals: season } }, limit: 1, depth: 0, overrideAccess: true, req: r })
    if (existing.docs[0]) await payload.update({ collection: 'fee-seasons', id: existing.docs[0].id, data: data as never, overrideAccess: true, depth: 0, req: r })
    else await payload.create({ collection: 'fee-seasons', data: data as never, overrideAccess: true, depth: 0, req: r })
  })
  return { count: toStore.length, totalCents }
}
