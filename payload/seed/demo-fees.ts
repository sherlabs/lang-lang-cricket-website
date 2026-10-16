import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { loadFeeModel, noon, storeClosedSeason } from '../../lib/office/fee-load'
import { ledgerFor } from '../../lib/office/fee-report'
import { seasonNameForYear, seasonOfClubDate, seasonRange } from '../../lib/office/season'

const CTX = { disableRevalidate: true } as const
type Doc = Record<string, unknown>

/**
 * Demo membership fees (wave D WP-2), written only when there are no membership types yet and the demo members and matches exist.
 * Season rules, names and dates come from the club config, never from a fixed year. The mix is fixed on purpose so the Fees page
 * shows every case: a closed past season whose figures are frozen (one member paid in full plus 20.00 extra so credit shows, one
 * part paid, one with a waived game, one still owing that also paid the current season's membership with a target, so last season
 * stays owing), the current season with season fees, and one household with a split payment across two children. Invented people,
 * made-up references, no card data.
 */
export async function seedDemoFees(payload: Payload, today: string): Promise<string> {
  if ((await payload.count({ collection: 'membership-tiers', overrideAccess: true })).totalDocs > 0) return 'membership types exist, skipped'
  if ((await payload.count({ collection: 'members', overrideAccess: true })).totalDocs === 0) return 'no members, skipped'

  const current = seasonOfClubDate(today)
  const past = seasonNameForYear(current.startYear - 1)
  const pastRange = seasonRange(past)!
  const admin = (await payload.find({ collection: 'users', where: { role: { equals: 'admin' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  const adminId = (admin?.id as number | undefined) ?? null
  const tier = async (season: string, name: string, kind: string, upfrontCents: number, perMatchCents: number) =>
    (await payload.create({ collection: 'membership-tiers', data: { season, name, kind, upfrontCents, perMatchCents, active: true } as never, overrideAccess: true, context: CTX, depth: 0 })).id as number
  const pastPlay = await tier(past, 'Pay as you play', 'per-match', 0, 1000)
  const curPlay = await tier(current.name, 'Pay as you play', 'per-match', 0, 1000)
  const curSeason = await tier(current.name, 'Season membership', 'upfront', 12000, 0)
  const curJunior = await tier(current.name, 'Junior season fee', 'upfront', 8000, 0)

  // The people who played most last season, as linked members.
  const rows = await payload.db.drizzle.execute(
    sql`SELECT mem.id AS member_id, count(*)::int AS games
        FROM "payload"."match_appearances" a JOIN "payload"."matches" m ON m.id = a.match_id JOIN "payload"."members" mem ON mem.player_id = a.player_id
        WHERE a.is_club_side = true AND m.local_date >= ${pastRange.from} AND m.local_date <= ${pastRange.to}
        GROUP BY mem.id ORDER BY games DESC, mem.id LIMIT 8`,
  )
  const cohort = (rows.rows as { member_id: number }[]).map((r) => r.member_id)

  const join = (member: number, season: string, tierId: number) => payload.create({ collection: 'memberships', data: { member, season, tier: tierId, joinedOn: noon(seasonRange(season)!.from) } as never, overrideAccess: true, context: CTX, depth: 0 })
  for (const m of cohort) await join(m, past, pastPlay)
  let closedNote = 'no stored games last season, so no closed season'
  if (cohort.length >= 4) {
    const loaded = await loadFeeModel(payload, false, [past])
    const stored = await storeClosedSeason(payload, loaded.model, past, adminId, false)
    closedNote = `${past} closed with ${stored.count} charges`
  }

  const pay = (member: number, amountCents: number, receivedOn: string, extra: Record<string, unknown> = {}) =>
    payload.create({ collection: 'fee-payments', data: { member, payer: member, receivedOn: noon(receivedOn), amountCents, method: 'bank-transfer', reference: `DEMO-${member}-${amountCents}`, recordedBy: adminId, ...extra } as never, overrideAccess: true, context: CTX, depth: 0 })
  const owed = async (member: number) => {
    const model = (await loadFeeModel(payload, false, [past])).model
    return ledgerFor(model, member).lines.reduce((s, l) => s + l.owedCents, 0)
  }
  const payDate = pastRange.to > today ? today : pastRange.to // the last day of last season
  const [full, part, waived, arrears, ...rest] = cohort
  if (full) await pay(full, (await owed(full)) + 2000, payDate, { note: 'Paid in full plus 20.00 towards next season' })
  if (part) await pay(part, Math.max(100, Math.floor((await owed(part)) / 2)), payDate, { method: 'cash' })
  if (waived) {
    const first = (await payload.find({ collection: 'fee-charges', where: { and: [{ member: { equals: waived } }, { kind: { equals: 'game' } }] }, sort: 'date', limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as Doc | undefined
    if (first?.matchId) await payload.create({ collection: 'fee-waivers', data: { member: waived, scope: 'game', matchId: first.matchId, season: past, note: 'Injured before the game; waived by the committee', grantedBy: adminId } as never, overrideAccess: true, context: CTX, depth: 0 })
  }
  for (const m of rest) {
    const o = await owed(m)
    if (o > 0) await pay(m, o, payDate, { method: 'cash' })
  }

  // The current season: season fees for the active players, and the arrears case.
  if (arrears) {
    await join(arrears, current.name, curSeason)
    await pay(arrears, 12000, today, { reference: 'DEMO-NEXT-SEASON', appliesTo: { kind: 'season', season: current.name }, note: 'Paid this season’s membership; last season’s match fees are still owing' })
  }
  for (const m of [full, part, waived].filter((x): x is number => typeof x === 'number')) await join(m, current.name, curSeason)
  if (full) await pay(full, 12000, today, { appliesTo: { kind: 'season', season: current.name } })
  // Two more pay per game this season, so the open season shows charges worked out from the games already in the store.
  const curRange = seasonRange(current.name)!
  const already = new Set<number>([full, part, waived, arrears].filter((x): x is number => typeof x === 'number'))
  const active = await payload.db.drizzle.execute(
    sql`SELECT a.player_id, mem.id AS member_id, count(*)::int AS games
        FROM "payload"."match_appearances" a JOIN "payload"."matches" m ON m.id = a.match_id LEFT JOIN "payload"."members" mem ON mem.player_id = a.player_id
        WHERE a.is_club_side = true AND a.player_id IS NOT NULL AND m.local_date >= ${curRange.from} AND m.local_date <= ${curRange.to}
        GROUP BY a.player_id, mem.id ORDER BY games DESC, a.player_id`,
  )
  let perGame = 0
  for (const r of active.rows as { player_id: number; member_id: number | null }[]) {
    if (perGame === 2) break
    if (r.member_id !== null && already.has(r.member_id)) continue
    // Players seen in this season's games who have no member yet get a contact-free linked one, the same as "Add members for players".
    const memberId = r.member_id ?? (await payload.create({ collection: 'members', data: { player: r.player_id, roles: ['player'], status: 'active', importedFrom: 'players' } as never, overrideAccess: true, context: CTX, depth: 0 })).id
    await join(memberId, current.name, curPlay)
    perGame++
  }

  // One household: a parent and two juniors, one split payment.
  const parent = (await payload.find({ collection: 'members', where: { and: [{ lastName: { equals: 'Whitfield' } }, { roles: { in: ['parent'] } }] }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as Doc | undefined
  const kid1 = (await payload.find({ collection: 'members', where: { and: [{ lastName: { equals: 'Whitfield' } }, { firstName: { equals: 'Mia' } }] }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as Doc | undefined
  let householdNote = 'no household'
  if (parent && kid1) {
    const sibling = await payload.create({ collection: 'members', data: { firstName: 'Zoe', lastName: 'Whitfield', roles: ['player'], dateOfBirth: '2016-05-14T12:00:00.000Z', guardians: [parent.id], importedFrom: 'manual' } as never, overrideAccess: true, context: CTX, depth: 0 })
    await join(kid1.id as number, current.name, curJunior)
    await join(sibling.id, current.name, curJunior)
    const group = 'demo-split-whitfield'
    for (const kid of [kid1.id as number, sibling.id]) await pay(kid, 8000, today, { payer: parent.id, splitGroup: group, reference: 'DEMO-SPLIT', appliesTo: { kind: 'season', season: current.name }, note: 'Family payment split across both children' })
    householdNote = 'one household with a split payment'
  }
  return `${closedNote}; ${cohort.length} members with ${past} games; ${householdNote}`
}
