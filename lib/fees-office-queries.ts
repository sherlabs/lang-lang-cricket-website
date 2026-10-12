import 'server-only'
import { randomUUID } from 'node:crypto'
import type { Payload, PayloadRequest, TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { currentClubDate } from '@/lib/selection/club-date'
import { isAdminUser } from '@/payload/access'
import { sanitiseSummary } from './office/audit'
import { writeAudit } from './office/audit-write'
import { validateAdjustment, validatePayment, validateVoid, validateWaiver, type CleanPayment, type FeeFormError, type RawPayment } from './office/fee-input'
import { feeReport, ledgerFor, owingSummary, previewPayment, type FeeMember, type FeeModel, type FeePayment, type FeeReport, type FeeWaiver, type StoredCharge } from './office/fee-report'
import { householdFor, type Allocation, type PaymentTarget } from './office/fees'
import { inTransaction, loadFeeModel, noon, storeClosedSeason, type FeeTier } from './office/fee-load'
import { formatMoney } from './office/money'
import { isSeasonName, seasonChoices, seasonNameForYear, seasonOfClubDate, seasonStartYearOfName } from './office/season'
import { getOfficeSettings } from './office/settings-server'
import type { OfficeSettings } from './office/settings'

/**
 * The data layer for the fee ledger (wave D spec section 4). Admin only: every function checks the caller itself, and the loaders read
 * with the access override only after that check (the ledger collections allow nobody to write over REST, so the writes below are the
 * only door). All arithmetic lives in the pure `lib/office/fee-report.ts`; this file moves rows in and out.
 */
const adminOnly = (user: unknown): user is TypedUser => isAdminUser(user as never)
const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)
type Doc = Record<string, unknown>

// ---- loading -----------------------------------------------------------------------------------------------------------------

export type LoadedFees = { model: FeeModel; tiers: FeeTier[]; settings: OfficeSettings; seasonsWithMemberships: string[] }

/** Everything the arithmetic needs for an admin caller (see `lib/office/fee-load.ts`); `focus` names the seasons whose games are loaded. */
export async function loadFees(user: TypedUser, focus?: readonly string[]): Promise<LoadedFees> {
  const payload = await getPayloadClient()
  const settings = await getOfficeSettings(user)
  const loaded = await loadFeeModel(payload, settings.chargeFillIns, focus)
  return { ...loaded, settings }
}

// ---- pages -------------------------------------------------------------------------------------------------------------------

export type FeesPage = {
  season: string
  seasons: string[]
  report: FeeReport
  tiers: FeeTier[]
  settings: OfficeSettings
  /** Active members with no membership in this season, for the add form. */
  unjoined: { id: number; name: string; isPlayer: boolean }[]
  membershipCount: number
}

export async function getFeesPage(user: unknown, seasonParam: string | null): Promise<FeesPage | null> {
  if (!adminOnly(user)) return null
  const today = currentClubDate()
  const season = seasonParam && isSeasonName(seasonParam) ? seasonParam : seasonOfClubDate(today).name
  const { model, tiers, settings, seasonsWithMemberships } = await loadFees(user, [season])
  const seasons = [...new Set([...seasonChoices(today), ...seasonsWithMemberships, season])].sort().reverse()
  const joined = new Set(model.memberships.filter((m) => m.season === season).map((m) => m.memberId))
  const unjoined = model.members.filter((m) => m.status === 'active' && !m.erased && !joined.has(m.id)).map((m) => ({ id: m.id, name: m.name, isPlayer: (m.roles ?? []).includes('player') })).sort((a, b) => a.name.localeCompare(b.name))
  return { season, seasons, report: feeReport(model, season), tiers: tiers.filter((t) => t.season === season), settings, unjoined, membershipCount: joined.size }
}

export type LedgerPage = {
  member: FeeMember
  allocation: Allocation
  household: FeeMember[]
  memberships: FeeModel['memberships']
  payments: (FeePayment & { payerName: string })[]
  waivers: FeeWaiver[]
  storedCharges: StoredCharge[]
  closedSeasons: string[]
  settings: OfficeSettings
  seasons: string[]
  preview: ReturnType<typeof previewPayment> | null
  nameOf: Record<number, string>
}

export async function getMemberLedger(user: unknown, memberId: number, previewInput?: { amountCents: number; target: PaymentTarget | null }): Promise<LedgerPage | null> {
  if (!adminOnly(user) || !Number.isInteger(memberId)) return null
  const { model, settings } = await loadFees(user)
  const member = model.members.find((m) => m.id === memberId)
  if (!member) return null
  const guardians = new Map(model.members.map((m) => [m.id, m.guardianIds]))
  const nameOf = Object.fromEntries(model.members.map((m) => [m.id, m.name]))
  const household = householdFor(memberId, guardians).map((id) => model.members.find((m) => m.id === id)).filter((m): m is FeeMember => Boolean(m))
  const preview = previewInput ? previewPayment(model, memberId, { id: 'preview', amountCents: previewInput.amountCents, receivedOn: currentClubDate(), appliesTo: previewInput.target }) : null
  return {
    member,
    allocation: ledgerFor(model, memberId),
    household,
    memberships: model.memberships.filter((m) => m.memberId === memberId),
    payments: model.payments.filter((p) => p.memberId === memberId).sort((a, b) => (a.receivedOn < b.receivedOn ? 1 : -1)).map((p) => ({ ...p, payerName: p.payerId ? (nameOf[p.payerId] ?? '') : '' })),
    waivers: model.waivers.filter((w) => w.memberId === memberId),
    storedCharges: model.stored.filter((c) => c.memberId === memberId),
    closedSeasons: [...model.closedSeasons],
    settings,
    seasons: [...new Set([...seasonChoices(currentClubDate()), ...model.memberships.filter((m) => m.memberId === memberId).map((m) => m.season)])].sort().reverse(),
    preview,
    nameOf,
  }
}

/** Landing tile and notification: members owing in the open seasons. Null for anyone but an admin, or when the data cannot be read. */
export async function feeOwingSummary(user: unknown): Promise<{ members: number; owedCents: number; money: string } | null> {
  if (!adminOnly(user)) return null
  try {
    const { model, settings, seasonsWithMemberships } = await loadFees(user)
    const open = seasonsWithMemberships.filter((s) => !model.closedSeasons.has(s))
    const s = owingSummary(model, open)
    return { ...s, money: formatMoney(s.owedCents, settings) }
  } catch (err) {
    console.warn('[office] fee summary unavailable:', (err as Error).message)
    return null
  }
}

// ---- writes ------------------------------------------------------------------------------------------------------------------

export type ActionResult = { ok: true; notice: string } | { ok: false; code: FeeFormError }
const fail = (code: FeeFormError): ActionResult => ({ ok: false, code })

async function memberExists(payload: Payload, id: number): Promise<boolean> {
  const r = await payload.count({ collection: 'members', where: { id: { equals: id } }, overrideAccess: true })
  return r.totalDocs > 0
}

/** Records a payment (or one row per child when it is split) in one transaction. */
export async function recordPayment(user: unknown, raw: RawPayment): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const checked = validatePayment(raw, currentClubDate())
  if (!checked.ok) return fail(checked.code)
  const v: CleanPayment = checked.value
  const payload = await getPayloadClient()
  if (!(await memberExists(payload, v.memberId)) || !(await memberExists(payload, v.payerId))) return fail('member')
  if (v.shares.length > 1) {
    if (v.appliesTo?.kind === 'charge') return fail('target')
    const members = await payload.find({ collection: 'members', pagination: false, depth: 0, overrideAccess: true, select: { guardians: true } })
    const guardians = new Map((members.docs as unknown as Doc[]).map((m) => [m.id as number, ((m.guardians as unknown[] | null) ?? []).map(idOf).filter((x): x is number => x !== null)]))
    const household = new Set(householdFor(v.memberId, guardians))
    if (!v.shares.every((s) => household.has(s.memberId))) return fail('split')
  } else if (v.shares[0].memberId !== v.memberId) return fail('split')
  const splitGroup = v.shares.length > 1 ? randomUUID() : null
  try {
    await inTransaction(payload, async (req) => {
      for (const s of v.shares) {
        await payload.create({
          collection: 'fee-payments',
          data: {
            member: s.memberId,
            payer: v.payerId,
            splitGroup,
            receivedOn: noon(v.receivedOn),
            amountCents: s.amountCents,
            method: v.method,
            reference: v.reference,
            note: v.note,
            appliesTo: v.appliesTo ? { kind: v.appliesTo.kind, season: v.appliesTo.kind === 'season' ? v.appliesTo.season : null, chargeId: v.appliesTo.kind === 'charge' ? (v.appliesTo.chargeId ?? null) : null, matchId: v.appliesTo.kind === 'charge' ? (v.appliesTo.matchId ?? null) : null } : { kind: null, season: null, chargeId: null, matchId: null },
            recordedBy: user.id,
          } as never,
          overrideAccess: true,
          depth: 0,
          req: req as PayloadRequest,
        })
      }
    })
  } catch (err) {
    console.warn('[office] record payment failed:', (err as Error).message)
    return fail('save')
  }
  return { ok: true, notice: 'paid' }
}

async function voidRows(payload: Payload, user: TypedUser, collection: 'fee-payments' | 'fee-waivers' | 'fee-charges', ids: number[], reason: string): Promise<void> {
  await inTransaction(payload, async (req) => {
    for (const id of ids) {
      await payload.update({ collection, id, data: { voidedAt: new Date().toISOString(), voidedBy: user.id, voidReason: reason } as never, overrideAccess: true, depth: 0, req: req as PayloadRequest })
    }
  })
}

/** Voids a payment; with `wholeGroup`, every row of the split it belongs to. */
export async function voidPayment(user: unknown, raw: { id: unknown; reason: unknown; wholeGroup?: unknown }): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const v = validateVoid(raw)
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  try {
    const row = (await payload.findByID({ collection: 'fee-payments', id: v.id, depth: 0, overrideAccess: true })) as unknown as Doc
    if (row.voidedAt) return fail('not-found')
    let ids = [v.id]
    if (raw.wholeGroup === 'yes' && typeof row.splitGroup === 'string' && row.splitGroup) {
      const group = await payload.find({ collection: 'fee-payments', where: { and: [{ splitGroup: { equals: row.splitGroup } }, { voidedAt: { exists: false } }] }, pagination: false, depth: 0, overrideAccess: true })
      ids = group.docs.map((d) => d.id as number)
    }
    await voidRows(payload, user, 'fee-payments', ids, v.reason)
  } catch (err) {
    console.warn('[office] void payment failed:', (err as Error).message)
    return fail('not-found')
  }
  return { ok: true, notice: 'voided' }
}

export async function addWaiver(user: unknown, raw: Parameters<typeof validateWaiver>[0]): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const v = validateWaiver(raw)
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  if (!(await memberExists(payload, v.value.memberId))) return fail('member')
  try {
    await payload.create({ collection: 'fee-waivers', data: { member: v.value.memberId, scope: v.value.scope, matchId: v.value.matchId, season: v.value.season, amountCents: v.value.amountCents, note: v.value.note, grantedBy: user.id } as never, overrideAccess: true, depth: 0 })
  } catch (err) {
    console.warn('[office] add waiver failed:', (err as Error).message)
    return fail('save')
  }
  return { ok: true, notice: 'waived' }
}

export async function voidWaiver(user: unknown, raw: { id: unknown; reason: unknown }): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const v = validateVoid(raw)
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  try {
    const row = (await payload.findByID({ collection: 'fee-waivers', id: v.id, depth: 0, overrideAccess: true })) as unknown as Doc
    if (row.voidedAt) return fail('not-found')
    await voidRows(payload, user, 'fee-waivers', [v.id], v.reason)
  } catch {
    return fail('not-found')
  }
  return { ok: true, notice: 'voided' }
}

/** After a season is closed a mistake is a void plus an adjustment: these two are the only ways to touch a stored charge. */
export async function voidCharge(user: unknown, raw: { id: unknown; reason: unknown }): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const v = validateVoid(raw)
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  try {
    const row = (await payload.findByID({ collection: 'fee-charges', id: v.id, depth: 0, overrideAccess: true })) as unknown as Doc
    if (row.voidedAt) return fail('not-found')
    await voidRows(payload, user, 'fee-charges', [v.id], v.reason)
  } catch {
    return fail('not-found')
  }
  return { ok: true, notice: 'voided' }
}

export async function addAdjustment(user: unknown, raw: Parameters<typeof validateAdjustment>[0]): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const v = validateAdjustment(raw, currentClubDate())
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  const closed = await payload.count({ collection: 'fee-seasons', where: { and: [{ season: { equals: v.season } }, { status: { equals: 'closed' } }] }, overrideAccess: true })
  if (closed.totalDocs === 0) return fail('season')
  if (!(await memberExists(payload, v.memberId))) return fail('member')
  try {
    await payload.create({ collection: 'fee-charges', data: { member: v.memberId, season: v.season, kind: 'adjustment', date: noon(v.date), amountCents: v.amountCents, description: v.note, closedAt: new Date().toISOString() } as never, overrideAccess: true, depth: 0 })
  } catch {
    return fail('save')
  }
  return { ok: true, notice: 'adjusted' }
}

export async function addMembership(user: unknown, raw: { memberIds: unknown[]; season: unknown; tierId: unknown; joinedOn: unknown }): Promise<ActionResult & { added?: number }> {
  if (!adminOnly(user)) return fail('forbidden')
  if (!isSeasonName(raw.season)) return fail('season')
  const tierId = Number(raw.tierId)
  const ids = [...new Set(raw.memberIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
  if (!Number.isInteger(tierId) || tierId <= 0) return fail('tier')
  if (!ids.length) return fail('member')
  const joined = typeof raw.joinedOn === 'string' && raw.joinedOn ? raw.joinedOn : null
  const payload = await getPayloadClient()
  let added = 0
  try {
    await inTransaction(payload, async (req) => {
      for (const id of ids) {
        const exists = await payload.count({ collection: 'memberships', where: { and: [{ member: { equals: id } }, { season: { equals: raw.season as string } }] }, overrideAccess: true, req: req as PayloadRequest })
        if (exists.totalDocs > 0) continue
        await payload.create({ collection: 'memberships', data: { member: id, season: raw.season as string, tier: tierId, joinedOn: joined ? noon(joined.slice(0, 10)) : undefined } as never, overrideAccess: true, depth: 0, req: req as PayloadRequest })
        added++
      }
    })
  } catch (err) {
    console.warn('[office] add membership failed:', (err as Error).message)
    return fail('save')
  }
  if (ids.length > 1) await writeAudit(payload, { userId: user.id, action: 'bulk-change', module: 'fees', summary: sanitiseSummary({ operation: 'add-memberships', seasonStartYear: seasonStartYearOfName(raw.season as string) ?? 0 }, { operation: ['add-memberships'], seasonStartYear: 'number' }), rowCount: added, includedSensitive: false })
  return { ok: true, notice: 'joined', added }
}

export async function removeMembership(user: unknown, id: number): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  try {
    await payload.delete({ collection: 'memberships', id, overrideAccess: true })
  } catch (err) {
    console.warn('[office] remove membership refused:', (err as Error).message)
    return fail('closed')
  }
  return { ok: true, notice: 'removed' }
}

export async function addTier(user: unknown, raw: { season: unknown; name: unknown; kind: unknown; upfront: unknown; perMatch: unknown }): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const { parseRate } = await import('./office/money')
  if (!isSeasonName(raw.season)) return fail('season')
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : ''
  if (!name) return fail('note')
  const kind = raw.kind === 'per-match' || raw.kind === 'free' || raw.kind === 'upfront' ? raw.kind : null
  if (!kind) return fail('scope')
  const upfrontCents = kind === 'free' ? 0 : parseRate(raw.upfront)
  const perMatchCents = kind === 'free' ? 0 : parseRate(raw.perMatch)
  if (upfrontCents === null || perMatchCents === null) return fail('amount')
  const payload = await getPayloadClient()
  try {
    await payload.create({ collection: 'membership-tiers', data: { season: raw.season, name, kind, upfrontCents, perMatchCents, active: true } as never, overrideAccess: true, depth: 0 })
  } catch (err) {
    console.warn('[office] add tier failed:', (err as Error).message)
    return fail('save')
  }
  return { ok: true, notice: 'tierAdded' }
}

/** Copies last season's membership types into `season` (rates unfrozen). Types already there by name are skipped. */
export async function copyTiers(user: unknown, season: unknown): Promise<ActionResult & { copied?: number }> {
  if (!adminOnly(user)) return fail('forbidden')
  if (!isSeasonName(season)) return fail('season')
  const prev = seasonNameForYear((seasonStartYearOfName(season) ?? 0) - 1)
  const payload = await getPayloadClient()
  const from = (await payload.find({ collection: 'membership-tiers', where: { season: { equals: prev } }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  const have = new Set(((await payload.find({ collection: 'membership-tiers', where: { season: { equals: season } }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[]).map((t) => String(t.name)))
  let copied = 0
  try {
    for (const t of from) {
      if (have.has(String(t.name))) continue
      await payload.create({ collection: 'membership-tiers', data: { season, name: t.name, kind: t.kind, upfrontCents: t.upfrontCents ?? 0, perMatchCents: t.perMatchCents ?? 0, active: true } as never, overrideAccess: true, depth: 0 })
      copied++
    }
  } catch {
    return fail('save')
  }
  return { ok: true, notice: 'copied', copied }
}

/**
 * Close season: derives the season's charges once, stores one row per charge, marks the season closed. Refuses when games are still
 * unmatched unless `closeAnyway` is ticked (recorded on the season row). From then on the season's figures come from the stored rows.
 */
export async function closeSeason(user: unknown, raw: { season: unknown; confirm: unknown; closeAnyway: unknown }): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  if (!isSeasonName(raw.season) || raw.confirm !== 'yes') return fail('season')
  const season = raw.season
  const payload = await getPayloadClient()
  const { model } = await loadFees(user, [season])
  if (model.closedSeasons.has(season)) return fail('closed')
  if (!model.memberships.some((m) => m.season === season)) return fail('season')
  const anyway = raw.closeAnyway === 'yes'
  if (model.unmatchedAppearances > 0 && !anyway) return fail('unmatched')
  let stored: { count: number }
  try {
    stored = await storeClosedSeason(payload, model, season, user.id, anyway)
  } catch (err) {
    console.warn('[office] close season failed:', (err as Error).message)
    return fail('save')
  }
  await writeAudit(payload, { userId: user.id, action: 'bulk-change', module: 'fees', summary: sanitiseSummary({ operation: 'close-season', seasonStartYear: seasonStartYearOfName(season) ?? 0, anyway }, { operation: ['close-season'], seasonStartYear: 'number', anyway: 'boolean' }), rowCount: stored.count, includedSensitive: false })
  return { ok: true, notice: 'closed' }
}

// ---- export ------------------------------------------------------------------------------------------------------------------

export const FEE_EXPORT_SUMMARY_SPEC = { seasonStartYear: 'number', detail: 'boolean', households: 'boolean' } as const

export async function feeExportTable(user: TypedUser, season: string, detail: boolean) {
  const { buildFeeExport } = await import('./office/fee-export')
  const { model, settings } = await loadFees(user, [season])
  return buildFeeExport(model, season, detail, settings)
}
