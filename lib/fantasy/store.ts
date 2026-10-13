import type { Payload, Where } from 'payload'
import { FANTASY, SEASON_START_MONTH } from '@/config/site'
import { fantasyTokenMatches } from './link'
import { resolveRules, type FantasyRules, type SeasonStatus } from './rules'
import { seasonWindow, type RoundFixture, type RoundStateRow } from './rounds'
import { isInTheGame } from './eligibility'

/**
 * Readers for the fantasy collections (wave F spec 4.2). Every function restates its own filter because the Local API ignores
 * access rules; secrets (PIN hash, salt, device code) are only read by the identification code in `join.ts`. Nothing here is a
 * public page: callers check the link, the cookie or the role first.
 */
export const FANTASY_TAG = 'fantasy'

export const idOf = (rel: unknown): number | null => (typeof rel === 'number' ? rel : rel && typeof rel === 'object' && 'id' in rel ? Number((rel as { id: unknown }).id) : null)

export type FantasySettings = { enabled: boolean; publicLeaderboard: boolean; competitionName: string; linkVersion: number }

export async function getFantasySettings(payload: Payload): Promise<FantasySettings> {
  const g = (await payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })) as unknown as { fantasy?: Partial<FantasySettings> | null }
  const f = g.fantasy ?? {}
  const version = Number(f.linkVersion)
  return {
    enabled: f.enabled === true,
    publicLeaderboard: f.publicLeaderboard === true,
    competitionName: (typeof f.competitionName === 'string' && f.competitionName.trim()) || FANTASY.defaultName,
    linkVersion: Number.isInteger(version) && version >= 1 ? version : 1,
  }
}

export type FantasySeason = {
  id: number
  seasonStartYear: number
  name: string
  status: SeasonStatus
  rules: FantasyRules
  blockedWords: string[]
  openedAt: string | null
}

type SeasonRow = { id: number; seasonStartYear: number; name: string; status: SeasonStatus; openedAt?: string | null; blockedWords?: string[] | null } & Record<string, unknown>

export function toSeason(d: SeasonRow): FantasySeason {
  return { id: d.id, seasonStartYear: d.seasonStartYear, name: d.name, status: d.status, rules: resolveRules(d), blockedWords: (d.blockedWords ?? []).filter(Boolean), openedAt: d.openedAt ?? null }
}

/** The season people play in: the newest `open` one. */
export async function getOpenSeason(payload: Payload): Promise<FantasySeason | null> {
  const res = await payload.find({ collection: 'fantasy-seasons', where: { status: { equals: 'open' } }, sort: '-seasonStartYear', limit: 1, depth: 0, overrideAccess: true })
  return res.docs[0] ? toSeason(res.docs[0] as unknown as SeasonRow) : null
}

/** The season the committee works on: a draft if there is one, else the newest. */
export async function getWorkingSeason(payload: Payload): Promise<FantasySeason | null> {
  const draft = await payload.find({ collection: 'fantasy-seasons', where: { status: { equals: 'draft' } }, sort: '-seasonStartYear', limit: 1, depth: 0, overrideAccess: true })
  if (draft.docs[0]) return toSeason(draft.docs[0] as unknown as SeasonRow)
  const any = await payload.find({ collection: 'fantasy-seasons', sort: '-seasonStartYear', limit: 1, depth: 0, overrideAccess: true })
  return any.docs[0] ? toSeason(any.docs[0] as unknown as SeasonRow) : null
}

export async function getSeasonById(payload: Payload, id: number): Promise<FantasySeason | null> {
  const d = await payload.findByID({ collection: 'fantasy-seasons', id, depth: 0, overrideAccess: true }).catch(() => null)
  return d ? toSeason(d as unknown as SeasonRow) : null
}

/**
 * The settings and season when `token` is the live link, else null. A wrong token, a rotated link, a disabled competition and a
 * season that is not open all look the same to the caller (a plain 404).
 */
export async function resolveFantasyLink(payload: Payload, token: string): Promise<{ settings: FantasySettings; season: FantasySeason } | null> {
  const settings = await getFantasySettings(payload)
  if (!settings.enabled || !fantasyTokenMatches(token, settings.linkVersion)) return null
  const season = await getOpenSeason(payload)
  return season ? { settings, season } : null
}

/** Is the competition visible at all (switched on with an open season)? Public pages 404 otherwise. */
export async function getPlayableCompetition(payload: Payload): Promise<{ settings: FantasySettings; season: FantasySeason } | null> {
  const settings = await getFantasySettings(payload)
  if (!settings.enabled) return null
  const season = await getOpenSeason(payload)
  return season ? { settings, season } : null
}

// ---- Rounds ----

export type RoundInputs = { fixtures: RoundFixture[]; states: (RoundStateRow & { id: number; scoredReason?: string | null })[]; storedGameIds: string[] }

/** Live fixtures of the season's dates, the round-state rows of the season and the ids of fixtures that have a stored FINAL game. */
export async function loadRoundInputs(payload: Payload, season: Pick<FantasySeason, 'id' | 'seasonStartYear'>): Promise<RoundInputs> {
  const seasonId = season.id
  const win = seasonWindow(season.seasonStartYear, SEASON_START_MONTH)
  const fx = await payload.find({ collection: 'selection-fixtures', where: { and: [{ status: { not_equals: 'removed' } }, { localDate: { greater_than_equal: win.from } }, { localDate: { less_than: win.to } }] } as Where, limit: 3000, pagination: false, depth: 0, overrideAccess: true, select: { gameId: true, localDate: true, startsAt: true, status: true } })
  const fixtures: RoundFixture[] = fx.docs.map((d) => ({ gameId: String(d.gameId), localDate: String(d.localDate), startsAt: d.startsAt ? String(d.startsAt) : null, status: String(d.status) }))
  const st = await payload.find({ collection: 'fantasy-round-state', where: { season: { equals: seasonId } }, limit: 500, pagination: false, depth: 0, overrideAccess: true })
  const states = st.docs.map((d) => {
    const r = d as unknown as { id: number; weekendKey: string; locksAt?: string | null; lockOverride?: string | null; scoredManually?: boolean | null; scoredReason?: string | null }
    return { id: r.id, weekendKey: r.weekendKey, locksAt: r.locksAt ?? null, lockOverride: r.lockOverride ?? null, scoredManually: r.scoredManually ?? false, scoredReason: r.scoredReason ?? null }
  })
  const ids = fixtures.map((f) => f.gameId)
  const stored = new Set<string>()
  for (let i = 0; i < ids.length; i += 500) {
    const m = await payload.find({ collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, { gameId: { in: ids.slice(i, i + 500) } }] } as Where, limit: 500, pagination: false, depth: 0, overrideAccess: true, select: { gameId: true } })
    for (const d of m.docs) stored.add(String(d.gameId))
  }
  return { fixtures, states, storedGameIds: [...stored] }
}

// ---- Prices and the player pool ----

export type PoolPlayer = {
  id: number
  name: string
  slug: string
  priceTenths: number
  autoPriceTenths: number
  overridden: boolean
  available: boolean
  inGame: boolean
  role: string | null
  basis: { games: number; points: number; shrunk: number; rank: number; thin: boolean } | null
}

type PriceRow = { player: unknown; priceTenths: number; autoPriceTenths: number; overridden?: boolean | null; available?: boolean | null; basis?: unknown }

export async function loadPool(payload: Payload, seasonId: number): Promise<Map<number, PoolPlayer>> {
  const out = new Map<number, PoolPlayer>()
  const prices = await payload.find({ collection: 'fantasy-prices', where: { season: { equals: seasonId } }, limit: 5000, pagination: false, depth: 0, overrideAccess: true })
  const ids = prices.docs.map((p) => idOf((p as unknown as PriceRow).player)).filter((x): x is number => x !== null)
  if (!ids.length) return out
  const players = new Map<number, { name: string; slug: string; hidden: boolean; isJunior: boolean }>()
  for (let i = 0; i < ids.length; i += 500) {
    const res = await payload.find({ collection: 'players', where: { id: { in: ids.slice(i, i + 500) } }, limit: 500, pagination: false, depth: 0, joins: false, overrideAccess: true, select: { slug: true, firstName: true, lastName: true, displayName: true, hidden: true, isJunior: true } })
    for (const p of res.docs as unknown as { id: number; slug?: string | null; firstName: string; lastName?: string | null; displayName?: string | null; hidden?: boolean | null; isJunior?: boolean | null }[]) {
      players.set(p.id, { name: p.displayName?.trim() || `${p.firstName} ${p.lastName ?? ''}`.trim(), slug: p.slug ?? '', hidden: Boolean(p.hidden), isJunior: Boolean(p.isJunior) })
    }
  }
  const roles = new Map<number, string>()
  const prof = await payload.find({ collection: 'player-selection-profiles', where: { player: { in: ids } }, limit: 5000, pagination: false, depth: 0, overrideAccess: true, select: { player: true, role: true } })
  for (const p of prof.docs as unknown as { player: unknown; role?: string | null }[]) {
    const pid = idOf(p.player)
    if (pid !== null && p.role) roles.set(pid, p.role)
  }
  for (const doc of prices.docs) {
    const row = doc as unknown as PriceRow
    const id = idOf(row.player)
    const pl = id === null ? undefined : players.get(id)
    if (id === null || !pl) continue
    const available = row.available !== false
    out.set(id, {
      id, name: pl.name, slug: pl.slug, priceTenths: row.priceTenths, autoPriceTenths: row.autoPriceTenths, overridden: Boolean(row.overridden), available,
      inGame: isInTheGame({ hidden: pl.hidden, isJunior: pl.isJunior, available }), role: roles.get(id) ?? null,
      basis: (row.basis && typeof row.basis === 'object' ? (row.basis as PoolPlayer['basis']) : null),
    })
  }
  return out
}

// ---- Entries and squads ----

export type EntryPublic = { id: number; teamName: string; joinedAt: string; disabled: boolean; mustChangePin: boolean; pinSetAt: string | null }
type EntryRow = { id: number; teamName: string; createdAt: string; disabled?: boolean | null; mustChangePin?: boolean | null; pinSetAt?: string | null }
export const toEntryPublic = (d: EntryRow): EntryPublic => ({ id: d.id, teamName: d.teamName, joinedAt: d.createdAt, disabled: Boolean(d.disabled), mustChangePin: Boolean(d.mustChangePin), pinSetAt: d.pinSetAt ?? null })

export async function getEntry(payload: Payload, seasonId: number, id: number): Promise<EntryPublic | null> {
  const d = await payload.findByID({ collection: 'fantasy-entries', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!d || idOf((d as unknown as { season: unknown }).season) !== seasonId) return null
  return toEntryPublic(d as unknown as EntryRow)
}

export async function listEntries(payload: Payload, seasonId: number, o: { includeDisabled?: boolean } = {}): Promise<EntryPublic[]> {
  const where: Where = o.includeDisabled ? { season: { equals: seasonId } } : { and: [{ season: { equals: seasonId } }, { disabled: { not_equals: true } }] }
  const res = await payload.find({ collection: 'fantasy-entries', where, limit: 5000, pagination: false, depth: 0, sort: 'createdAt', overrideAccess: true, select: { teamName: true, createdAt: true, disabled: true, mustChangePin: true, pinSetAt: true } })
  return res.docs.map((d) => toEntryPublic(d as unknown as EntryRow))
}

export type SquadRowLite = { entry: number; round: string; picks: number[]; captain: number | null; spentTenths: number; transfersUsed: number; savedAt: string | null }
type SquadDoc = { entry: unknown; round: string; picks?: { player: unknown }[] | null; captain?: unknown; spentTenths?: number | null; transfersUsed?: number | null; savedAt?: string | null }
export const toSquad = (d: SquadDoc): SquadRowLite => ({
  entry: idOf(d.entry) ?? 0, round: d.round, picks: (d.picks ?? []).map((p) => idOf(p.player)).filter((x): x is number => x !== null), captain: idOf(d.captain),
  spentTenths: d.spentTenths ?? 0, transfersUsed: d.transfersUsed ?? 0, savedAt: d.savedAt ?? null,
})

/** One manager's own squads (the owner reads their own through their cookie). */
export async function squadsOfEntry(payload: Payload, entryId: number): Promise<SquadRowLite[]> {
  const res = await payload.find({ collection: 'fantasy-squads', where: { entry: { equals: entryId } }, limit: 500, pagination: false, depth: 0, sort: 'round', overrideAccess: true })
  return res.docs.map((d) => toSquad(d as unknown as SquadDoc))
}

/**
 * Squads for the leaderboard: ONLY rounds up to and including `lastLockedRound` (a squad for a round that has not locked is never
 * read here), for the given managers.
 */
export async function lockedSquads(payload: Payload, entryIds: readonly number[], lastLockedRound: string | null): Promise<SquadRowLite[]> {
  if (!entryIds.length || lastLockedRound === null) return []
  const out: SquadRowLite[] = []
  for (let i = 0; i < entryIds.length; i += 400) {
    const res = await payload.find({ collection: 'fantasy-squads', where: { and: [{ entry: { in: entryIds.slice(i, i + 400) } }, { round: { less_than_equal: lastLockedRound } }] } as Where, limit: 20000, pagination: false, depth: 0, overrideAccess: true })
    out.push(...res.docs.map((d) => toSquad(d as unknown as SquadDoc)))
  }
  return out
}

/** Counts for the committee before the lock: how many managers have saved a squad for the round (never the squads). */
export async function savedCountForRound(payload: Payload, seasonId: number, round: string): Promise<{ saved: number; total: number }> {
  const entries = await listEntries(payload, seasonId)
  if (!entries.length) return { saved: 0, total: 0 }
  const res = await payload.find({ collection: 'fantasy-squads', where: { and: [{ entry: { in: entries.map((e) => e.id) } }, { round: { equals: round } }] } as Where, limit: 1, depth: 0, overrideAccess: true })
  return { saved: res.totalDocs, total: entries.length }
}
