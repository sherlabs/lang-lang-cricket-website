import type { Payload, TypedUser } from 'payload'
import { currentSquads, membersBySquad } from '@/lib/selection/store'
import { isAdminUser, isStaffUser } from '@/payload/access'
import { fantasyCopy } from '../../payload/admin/copy'
import { revalidatePaths } from '../../payload/hooks/revalidate'
import type { FactSet } from '../stats/match/types'
import { canBePriced, isEligible } from './eligibility'
import { currentLock } from './lock-server'
import { checkNameShape, NAME_UNAVAILABLE } from './names'
import { temporaryPin } from './pin'
import { hashPin } from '@/lib/selection/pin'
import { addMissing, computePrices, type PriceInput, type PriceResult } from './pricing'
import { DEFAULT_RULES, RULE_NUMBER_KEYS, SCORING_KEYS, cheapestSquadCost, resolveRules, rulesProblem, type FantasyRules } from './rules'
import { pointsForMatches, scoringMatchIds } from './score'
import { FANTASY_TAG, getSeasonById, idOf, toSeason, type FantasySeason } from './store'

/**
 * The committee's operations on the fantasy competition (wave F spec 4.7). Each takes the acting user and RE-CHECKS the role here, so
 * the server action in front of it is not the only guard: staff (admin or editor) for the day-to-day, admin only for rules, prices,
 * opening, rotating the link, PIN resets (a reset lets the person sign in as that team and read its saved squad) and exports. Never a selector. Nothing here logs or returns a PIN except `resetPin`, which returns the
 * temporary one once, to the person who pressed the button.
 */
export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; message: string }
const DENIED = { ok: false, message: 'Only an administrator can do that.' } as const
const NOT_STAFF = { ok: false, message: 'Please sign in again.' } as const
const CTX = { disableRevalidate: true }

const actorName = (u: TypedUser): string => (u as { name?: string | null }).name?.trim() || (u as { email?: string }).email || 'A committee member'
const requireStaff = (u: unknown): u is TypedUser => isStaffUser(u as never)
const requireAdmin = (u: unknown): u is TypedUser => isAdminUser(u as never)

const fmtDate = (d: Date): string => d.toISOString().slice(0, 10)

async function touch(): Promise<void> {
  await revalidatePaths(['/fantasy', '/fantasy/leaderboard'], undefined, [FANTASY_TAG])
}

/** Add a plain line (never a PIN) to the log administrators see on the Home page. Keeps the last 20. Read-modify-write: two actions in the same instant can lose one line, which is accepted for a note that is only a courtesy to the administrators. */
export async function addAdminLog(payload: Payload, seasonId: number, text: string, now: Date = new Date()): Promise<void> {
  const doc = (await payload.findByID({ collection: 'fantasy-seasons', id: seasonId, depth: 0, overrideAccess: true })) as unknown as { adminLog?: { at: string; text: string }[] | null }
  const log = [...(Array.isArray(doc.adminLog) ? doc.adminLog : []), { at: now.toISOString(), text }].slice(-20)
  await payload.update({ collection: 'fantasy-seasons', id: seasonId, data: { adminLog: log } as never, overrideAccess: true, context: CTX })
}

// ---- Prices ----

type PlayerFlags = { id: number; hidden: boolean; isJunior: boolean }

/** Who can be priced right now, with the figures behind the price. `facts` are the stored seasons the rules say to use. */
export async function buildPriceInputs(payload: Payload, rules: FantasyRules, facts: FactSet, now: Date = new Date()): Promise<PriceInput[]> {
  const res = await payload.find({ collection: 'players', where: { and: [{ hidden: { not_equals: true } }, { isJunior: { not_equals: true } }] }, limit: 10000, pagination: false, depth: 0, joins: false, overrideAccess: true, select: { hidden: true, isJunior: true } })
  const players = res.docs as unknown as PlayerFlags[]
  const { squads } = await currentSquads(payload, now)
  const members = await membersBySquad(payload, squads.map((s) => s.id))
  const inSquad = new Set([...members.values()].flat())
  const appearances = new Map<number, number>()
  for (const a of facts.appearances) appearances.set(a.player, (appearances.get(a.player) ?? 0) + 1)
  const candidates = new Set(players.map((p) => p.id))
  const totals = pointsForMatches(facts, scoringMatchIds(facts), rules.scoring, candidates)
  const out: PriceInput[] = []
  for (const p of players) {
    if (!isEligible({ hidden: p.hidden, isJunior: p.isJunior, inCurrentSquad: inSquad.has(p.id), recentAppearances: appearances.get(p.id) ?? 0, available: true })) continue
    const t = totals.get(p.id)
    out.push({ id: p.id, games: t?.games ?? 0, points: t?.points ?? 0 })
  }
  return out
}
export { canBePriced }

const priceParams = (r: FantasyRules) => ({ minPriceTenths: r.minPriceTenths, maxPriceTenths: r.maxPriceTenths, priorGames: r.priorGames, minGamesForPrice: r.minGamesForPrice })

type PriceDoc = { id: number; player: unknown; overridden?: boolean | null }

async function priceRows(payload: Payload, seasonId: number): Promise<PriceDoc[]> {
  const res = await payload.find({ collection: 'fantasy-prices', where: { season: { equals: seasonId } }, limit: 10000, pagination: false, depth: 0, overrideAccess: true })
  return res.docs as unknown as PriceDoc[]
}

async function writePrice(payload: Payload, seasonId: number, r: PriceResult, existing?: PriceDoc): Promise<void> {
  if (existing) {
    const keep = Boolean(existing.overridden)
    await payload.update({ collection: 'fantasy-prices', id: existing.id, data: { autoPriceTenths: r.priceTenths, basis: r.basis, ...(keep ? {} : { priceTenths: r.priceTenths }) } as never, overrideAccess: true, context: CTX })
  } else {
    await payload.create({ collection: 'fantasy-prices', data: { season: seasonId, player: r.id, priceTenths: r.priceTenths, autoPriceTenths: r.priceTenths, overridden: false, available: true, basis: r.basis } as never, overrideAccess: true, context: CTX })
  }
}

/** Calculate (or recalculate, while the season is a draft) the prices. Overridden prices keep their value; a player no longer eligible loses an automatic row. */
export async function calculatePrices(payload: Payload, user: unknown, season: FantasySeason, facts: FactSet): Promise<Outcome<{ priced: number }>> {
  if (!requireAdmin(user)) return DENIED
  if (season.status !== 'draft') return { ok: false, message: 'Prices are calculated while the season is a draft. After it opens, use Add missing players or change one price.' }
  const inputs = await buildPriceInputs(payload, season.rules, facts)
  const results = computePrices(inputs, priceParams(season.rules))
  const existing = new Map((await priceRows(payload, season.id)).map((r) => [idOf(r.player)!, r]))
  for (const r of results) await writePrice(payload, season.id, r, existing.get(r.id))
  const keepIds = new Set(results.map((r) => r.id))
  for (const [pid, row] of existing) if (!keepIds.has(pid) && !row.overridden) await payload.delete({ collection: 'fantasy-prices', id: row.id, overrideAccess: true, context: CTX })
  await touch()
  return { ok: true, priced: results.length }
}

/** Default-priced rows for eligible players who have none (a mid-season signing). Never creates a row twice, never touches an existing price. */
export async function addMissingPlayers(payload: Payload, user: unknown, season: FantasySeason, facts: FactSet): Promise<Outcome<{ added: number }>> {
  if (!requireAdmin(user)) return DENIED
  if (season.status === 'closed') return { ok: false, message: 'This season is closed.' }
  const inputs = await buildPriceInputs(payload, season.rules, facts)
  const existing = new Set((await priceRows(payload, season.id)).map((r) => idOf(r.player)!))
  const rows = addMissing(inputs, existing, priceParams(season.rules))
  for (const r of rows) await writePrice(payload, season.id, r)
  await touch()
  return { ok: true, added: rows.length }
}

export async function setPrice(payload: Payload, user: unknown, season: FantasySeason, playerId: number, tenths: number | null): Promise<Outcome> {
  if (!requireAdmin(user)) return DENIED
  if (season.status === 'closed') return { ok: false, message: 'This season is closed.' }
  const row = (await priceRows(payload, season.id)).find((r) => idOf(r.player) === playerId)
  if (!row) return { ok: false, message: 'That player has no price yet. Use Add missing players.' }
  if (tenths === null) {
    const full = (await payload.findByID({ collection: 'fantasy-prices', id: row.id, depth: 0, overrideAccess: true })) as unknown as { autoPriceTenths: number }
    await payload.update({ collection: 'fantasy-prices', id: row.id, data: { priceTenths: full.autoPriceTenths, overridden: false }, overrideAccess: true, context: CTX })
  } else {
    if (!Number.isInteger(tenths) || tenths < season.rules.minPriceTenths || tenths > season.rules.maxPriceTenths) return { ok: false, message: `A price is between ${season.rules.minPriceTenths / 10} and ${season.rules.maxPriceTenths / 10} credits.` }
    await payload.update({ collection: 'fantasy-prices', id: row.id, data: { priceTenths: tenths, overridden: true }, overrideAccess: true, context: CTX })
  }
  await touch()
  return { ok: true }
}

export async function setAvailable(payload: Payload, user: unknown, season: FantasySeason, playerId: number, available: boolean): Promise<Outcome> {
  if (!requireAdmin(user)) return DENIED
  const row = (await priceRows(payload, season.id)).find((r) => idOf(r.player) === playerId)
  if (!row) return { ok: false, message: 'That player has no price yet.' }
  await payload.update({ collection: 'fantasy-prices', id: row.id, data: { available }, overrideAccess: true, context: CTX })
  await touch()
  return { ok: true }
}

// ---- Season set up ----

/** Creates the draft season for `year` (with last season's rules, or the built-in defaults) and calculates prices once. Idempotent for a year that exists. */
export async function setUpSeason(payload: Payload, user: unknown, input: { year: number; name: string; facts: FactSet | ((rules: FantasyRules) => Promise<FactSet>) }): Promise<Outcome<{ season: FantasySeason; created: boolean }>> {
  if (!requireAdmin(user)) return DENIED
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2200) return { ok: false, message: 'Choose a season year.' }
  const name = input.name.trim().slice(0, 60)
  if (!name) return { ok: false, message: 'Give the season a name.' }
  const found = await payload.find({ collection: 'fantasy-seasons', where: { seasonStartYear: { equals: input.year } }, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs[0]) return { ok: true, season: toSeason(found.docs[0] as never), created: false }
  const prev = await payload.find({ collection: 'fantasy-seasons', where: { seasonStartYear: { less_than: input.year } }, sort: '-seasonStartYear', limit: 1, depth: 0, overrideAccess: true })
  const base = prev.docs[0] ? toSeason(prev.docs[0] as never) : null
  const rules = base ? base.rules : resolveRules(DEFAULT_RULES)
  const doc = await payload.create({ collection: 'fantasy-seasons', data: { seasonStartYear: input.year, name, status: 'draft', ...ruleData(rules), blockedWords: base?.blockedWords ?? [] } as never, overrideAccess: true, context: CTX })
  const season = toSeason(doc as never)
  const r = await calculatePrices(payload, user, season, typeof input.facts === 'function' ? await input.facts(season.rules) : input.facts)
  if (!r.ok) return r
  await touch()
  return { ok: true, season, created: true }
}

function ruleData(r: FantasyRules): Record<string, unknown> {
  const d: Record<string, unknown> = {}
  for (const k of RULE_NUMBER_KEYS) d[k] = r[k]
  d.scoring = { ...r.scoring }
  return d
}

/** Edit the rules of a DRAFT season (a rule is read-only once it opens, so a mid-season edit never reorders the table). */
export async function updateRules(payload: Payload, user: unknown, season: FantasySeason, patch: Partial<Omit<FantasyRules, 'scoring'>> & { scoring?: Partial<FantasyRules['scoring']> }): Promise<Outcome<{ season: FantasySeason }>> {
  if (!requireAdmin(user)) return DENIED
  if (season.status !== 'draft') return { ok: false, message: 'The rules are fixed once the season has opened.' }
  for (const k of SCORING_KEYS) if (patch.scoring && k in patch.scoring && !Number.isFinite(patch.scoring[k])) return { ok: false, message: 'Scores must be whole numbers.' }
  const wanted = { ...season.rules, ...patch }
  const unworkable = rulesProblem(wanted)
  if (unworkable) return { ok: false, message: unworkable }
  const merged = resolveRules({ ...wanted, scoring: { ...season.rules.scoring, ...(patch.scoring ?? {}) } })
  const clamped = rulesProblem(merged)
  if (clamped) return { ok: false, message: clamped }
  const doc = await payload.update({ collection: 'fantasy-seasons', id: season.id, data: ruleData(merged) as never, overrideAccess: true, context: CTX })
  await touch()
  return { ok: true, season: toSeason(doc as never) }
}

export async function setBlockedWords(payload: Payload, user: unknown, season: FantasySeason, words: string[]): Promise<Outcome> {
  if (!requireStaff(user)) return NOT_STAFF
  const clean = [...new Set(words.map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2 && w.length <= 30))].slice(0, 200)
  await payload.update({ collection: 'fantasy-seasons', id: season.id, data: { blockedWords: clean } as never, overrideAccess: true, context: CTX })
  return { ok: true }
}

export async function openSeason(payload: Payload, user: unknown, season: FantasySeason): Promise<Outcome<{ season: FantasySeason }>> {
  if (!requireAdmin(user)) return DENIED
  if (season.status !== 'draft') return { ok: false, message: 'Only a draft season can be opened.' }
  const other = await payload.find({ collection: 'fantasy-seasons', where: { status: { equals: 'open' } }, limit: 1, depth: 0, overrideAccess: true })
  if (other.docs[0]) return { ok: false, message: 'Another season is open. Close it first.' }
  const problem = rulesProblem(season.rules)
  if (problem) return { ok: false, message: problem }
  const rows = (await payload.find({ collection: 'fantasy-prices', where: { and: [{ season: { equals: season.id } }, { available: { not_equals: false } }] }, limit: 10000, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as { priceTenths: number }[]
  const cheapest = cheapestSquadCost(rows.map((r) => r.priceTenths), season.rules.squadSize)
  if (cheapest === null) return { ok: false, message: `Only ${rows.length} players are priced and available. A squad needs ${season.rules.squadSize}.` }
  if (cheapest > season.rules.salaryCapTenths) return { ok: false, message: `The cheapest squad of ${season.rules.squadSize} costs ${cheapest / 10} credits, over the salary cap of ${season.rules.salaryCapTenths / 10}. Raise the cap or lower some prices.` }
  const doc = await payload.update({ collection: 'fantasy-seasons', id: season.id, data: { status: 'open', openedAt: new Date().toISOString() }, overrideAccess: true, context: CTX })
  await touch()
  return { ok: true, season: toSeason(doc as never) }
}

export async function closeSeason(payload: Payload, user: unknown, season: FantasySeason): Promise<Outcome> {
  if (!requireAdmin(user)) return DENIED
  await payload.update({ collection: 'fantasy-seasons', id: season.id, data: { status: 'closed' }, overrideAccess: true, context: CTX })
  await touch()
  return { ok: true }
}

// ---- Rounds ----

export async function markRoundScored(payload: Payload, user: unknown, season: FantasySeason, weekendKey: string, reason: string, now: Date = new Date()): Promise<Outcome> {
  if (!requireAdmin(user)) return DENIED
  const why = reason.trim().slice(0, 200)
  if (!why) return { ok: false, message: 'Say why, for example "washed out".' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekendKey)) return { ok: false, message: 'Unknown round.' }
  const lock = await currentLock(payload, season.id, weekendKey)
  if (now.getTime() < lock.getTime()) return { ok: false, message: 'A round can only be marked scored after it has locked.' }
  const st = await payload.find({ collection: 'fantasy-round-state', where: { and: [{ season: { equals: season.id } }, { weekendKey: { equals: weekendKey } }] }, limit: 1, depth: 0, overrideAccess: true })
  const data = { scoredManually: true, scoredReason: why, scoredBy: (user as TypedUser).id, scoredAt: now.toISOString() }
  if (st.docs[0]) await payload.update({ collection: 'fantasy-round-state', id: st.docs[0].id, data: data as never, overrideAccess: true, context: CTX })
  else await payload.create({ collection: 'fantasy-round-state', data: { season: season.id, weekendKey, locksAt: lock.toISOString(), ...data } as never, overrideAccess: true, context: CTX })
  await addAdminLog(payload, season.id, fantasyCopy.roundScored(weekendKey, actorName(user), fmtDate(now), why), now)
  await touch()
  return { ok: true }
}

/** A committee lock override. It can only move the lock EARLIER than the current one; the lowered value is stored so it can never be raised again. */
export async function setLockOverride(payload: Payload, user: unknown, season: FantasySeason, weekendKey: string, at: Date, now: Date = new Date()): Promise<Outcome> {
  if (!requireAdmin(user)) return DENIED
  const lock = await currentLock(payload, season.id, weekendKey)
  if (at.getTime() >= lock.getTime()) return { ok: false, message: 'The lock can only be moved earlier.' }
  const st = await payload.find({ collection: 'fantasy-round-state', where: { and: [{ season: { equals: season.id } }, { weekendKey: { equals: weekendKey } }] }, limit: 1, depth: 0, overrideAccess: true })
  if (!st.docs[0]) return { ok: false, message: 'Unknown round.' }
  await payload.update({ collection: 'fantasy-round-state', id: st.docs[0].id, data: { lockOverride: at.toISOString(), locksAt: at.toISOString() }, overrideAccess: true, context: CTX })
  void now
  await touch()
  return { ok: true }
}

// ---- Managers ----

async function entryOf(payload: Payload, season: FantasySeason, id: number): Promise<{ id: number; teamName: string } | null> {
  const d = await payload.findByID({ collection: 'fantasy-entries', id, depth: 0, overrideAccess: true }).catch(() => null)
  const row = d as unknown as { id: number; teamName: string; season: unknown } | null
  return row && idOf(row.season) === season.id ? row : null
}

/** Search managers by team name: id, team name and join date only. Never a PIN or a hash. */
export async function searchManagers(payload: Payload, user: unknown, season: FantasySeason, q: string): Promise<{ id: number; teamName: string; joined: string; disabled: boolean }[]> {
  if (!requireStaff(user)) return []
  const needle = q.trim().slice(0, 40)
  const res = await payload.find({
    collection: 'fantasy-entries', where: needle ? { and: [{ season: { equals: season.id } }, { teamName: { like: needle } }] } : { season: { equals: season.id } },
    limit: 50, depth: 0, sort: 'teamName', overrideAccess: true, select: { teamName: true, createdAt: true, disabled: true },
  })
  return res.docs.map((d) => ({ id: d.id, teamName: String((d as { teamName: string }).teamName), joined: String((d as { createdAt: string }).createdAt).slice(0, 10), disabled: Boolean((d as { disabled?: boolean }).disabled) }))
}

/** The last resort for a forgotten PIN: a temporary one, shown once to the person who pressed the button. Audited without the PIN. */
export async function resetPin(payload: Payload, user: unknown, season: FantasySeason, entryId: number, now: Date = new Date()): Promise<Outcome<{ teamName: string; tempPin: string }>> {
  if (!requireAdmin(user)) return DENIED
  const e = await entryOf(payload, season, entryId)
  if (!e) return { ok: false, message: 'That manager was not found.' }
  const pin = temporaryPin()
  const { hash, salt } = await hashPin(pin)
  await payload.update({ collection: 'fantasy-entries', id: e.id, data: { pinHash: hash, pinSalt: salt, pinSetAt: now.toISOString(), mustChangePin: true, deviceCodeHash: null, deviceCodeExpires: null }, overrideAccess: true, context: CTX })
  await addAdminLog(payload, season.id, fantasyCopy.pinReset(e.teamName, actorName(user), fmtDate(now)), now)
  return { ok: true, teamName: e.teamName, tempPin: pin }
}

export async function setDisabled(payload: Payload, user: unknown, season: FantasySeason, entryId: number, disabled: boolean, now: Date = new Date()): Promise<Outcome> {
  if (!requireStaff(user)) return NOT_STAFF
  const e = await entryOf(payload, season, entryId)
  if (!e) return { ok: false, message: 'That manager was not found.' }
  await payload.update({ collection: 'fantasy-entries', id: e.id, data: { disabled }, overrideAccess: true, context: CTX })
  if (disabled) await addAdminLog(payload, season.id, fantasyCopy.disabled(e.teamName, actorName(user), fmtDate(now)), now)
  await touch()
  return { ok: true }
}

export async function renameEntry(payload: Payload, user: unknown, season: FantasySeason, entryId: number, name: string, now: Date = new Date()): Promise<Outcome> {
  if (!requireStaff(user)) return NOT_STAFF
  const e = await entryOf(payload, season, entryId)
  if (!e) return { ok: false, message: 'That manager was not found.' }
  const shape = checkNameShape(name)
  if (!shape.ok) return { ok: false, message: shape.message }
  try {
    await payload.update({ collection: 'fantasy-entries', id: e.id, data: { teamName: shape.name, nameKey: shape.key }, overrideAccess: true, context: CTX })
  } catch {
    return { ok: false, message: NAME_UNAVAILABLE }
  }
  await addAdminLog(payload, season.id, fantasyCopy.renamed(e.teamName, shape.name, actorName(user), fmtDate(now)), now)
  await touch()
  return { ok: true }
}

/** Deletes the manager and their squads (asking the committee is how a person is removed). */
export async function removeEntry(payload: Payload, user: unknown, season: FantasySeason, entryId: number, now: Date = new Date()): Promise<Outcome> {
  if (!requireStaff(user)) return NOT_STAFF
  const e = await entryOf(payload, season, entryId)
  if (!e) return { ok: false, message: 'That manager was not found.' }
  await payload.delete({ collection: 'fantasy-squads', where: { entry: { equals: e.id } }, overrideAccess: true, context: { ...CTX, fantasyRescore: true } })
  await payload.delete({ collection: 'fantasy-entries', id: e.id, overrideAccess: true, context: CTX })
  await addAdminLog(payload, season.id, fantasyCopy.removed(e.teamName, actorName(user), fmtDate(now)), now)
  await touch()
  return { ok: true }
}

// ---- Switches (site-settings.fantasy) ----

/** Rotating the link ends the old link, every remembered device and every lock key. */
export async function rotateLink(payload: Payload, user: unknown): Promise<Outcome<{ linkVersion: number }>> {
  if (!requireAdmin(user)) return DENIED
  const g = (await payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })) as unknown as { fantasy?: { linkVersion?: number } }
  const next = Math.max(1, Number(g.fantasy?.linkVersion) || 1) + 1
  await payload.updateGlobal({ slug: 'site-settings', data: { fantasy: { linkVersion: next } } as never, overrideAccess: true, context: CTX })
  await touch()
  return { ok: true, linkVersion: next }
}

/** Staff switches go through the Local API WITH access rules on, so the field-level access on `site-settings.fantasy` is the last word. */
export async function setSwitch(payload: Payload, user: unknown, change: { enabled?: boolean; publicLeaderboard?: boolean; competitionName?: string }): Promise<Outcome> {
  if (!requireStaff(user)) return NOT_STAFF
  if (change.enabled !== undefined && !requireAdmin(user)) return DENIED
  const data: Record<string, unknown> = {}
  if (change.enabled !== undefined) data.enabled = change.enabled
  if (change.publicLeaderboard !== undefined) data.publicLeaderboard = change.publicLeaderboard
  if (change.competitionName !== undefined) {
    const n = change.competitionName.replace(/\s+/g, ' ').trim()
    if (n.length < 3 || n.length > 40) return { ok: false, message: 'The name is 3 to 40 characters.' }
    data.competitionName = n
  }
  await payload.updateGlobal({ slug: 'site-settings', data: { fantasy: data } as never, user: user as TypedUser, overrideAccess: false, context: CTX })
  await touch()
  return { ok: true }
}

export async function seasonOf(payload: Payload, id: number): Promise<FantasySeason | null> {
  return getSeasonById(payload, id)
}
