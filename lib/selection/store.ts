import type { Payload, Where } from 'payload'
import { currentSeasonStartYear } from './season'

/**
 * Shared reads for the availability link and the selector area (announce-teams spec 4). These run with the Local API's access
 * override (`overrideAccess: true`, the default), so every caller has already checked who is asking: the availability link by its
 * signed cookie, the selector area by `requireSelection()` plus the role check in the `lib/selector-*` files.
 */
export type SelectionSettingsValues = { linkEnabled: boolean; linkVersion: number; availabilityLockHours: number }

export async function getSelectionSettings(payload: Payload): Promise<SelectionSettingsValues> {
  const g = await payload.findGlobal({ slug: 'selection-settings', depth: 0 })
  const version = Number((g as { linkVersion?: unknown }).linkVersion)
  const hours = Number((g as { availabilityLockHours?: unknown }).availabilityLockHours)
  return {
    // A never-saved global has no row: the defaults (on, version 1, no cutoff) apply.
    linkEnabled: (g as { linkEnabled?: boolean | null }).linkEnabled !== false,
    linkVersion: Number.isInteger(version) && version >= 1 ? version : 1,
    availabilityLockHours: Number.isFinite(hours) && hours > 0 ? hours : 0,
  }
}

export type PlayerLite = { id: number; slug: string; name: string; firstName: string; lastName: string; preferredName: string | null; displayName: string | null; hidden: boolean }

type RawPlayer = { id: number; slug?: string | null; firstName: string; lastName?: string | null; preferredName?: string | null; displayName?: string | null; hidden?: boolean | null }
export const toPlayerLite = (p: RawPlayer): PlayerLite => ({
  id: p.id,
  slug: p.slug ?? '',
  firstName: p.firstName,
  lastName: p.lastName ?? '',
  preferredName: p.preferredName ?? null,
  displayName: p.displayName ?? null,
  name: p.displayName?.trim() || `${p.firstName} ${p.lastName ?? ''}`.trim(),
  hidden: Boolean(p.hidden),
})

export const idOf = (rel: unknown): number | null => (typeof rel === 'number' ? rel : rel && typeof rel === 'object' && 'id' in rel ? Number((rel as { id: unknown }).id) : null)

const PLAYER_SELECT = { slug: true, firstName: true, lastName: true, preferredName: true, displayName: true, hidden: true } as const

export async function loadPlayers(payload: Payload, ids: readonly number[]): Promise<Map<number, PlayerLite>> {
  const out = new Map<number, PlayerLite>()
  if (!ids.length) return out
  const res = await payload.find({ collection: 'players', where: { id: { in: [...ids] } }, limit: ids.length, pagination: false, depth: 0, joins: false, select: PLAYER_SELECT, overrideAccess: true })
  for (const p of res.docs) out.set(p.id, toPlayerLite(p as RawPlayer))
  return out
}

export type SquadRow = { id: number; seasonStartYear: number; gradeId: string; gradeName: string }

export async function currentSquads(payload: Payload, now: Date = new Date()): Promise<{ year: number; squads: SquadRow[] }> {
  const year = currentSeasonStartYear(now)
  const res = await payload.find({ collection: 'squads', where: { seasonStartYear: { equals: year } }, limit: 200, pagination: false, depth: 0, sort: 'gradeName', overrideAccess: true })
  return { year, squads: res.docs as unknown as SquadRow[] }
}

/** Every membership of the given squads: squad id to player ids. */
export async function membersBySquad(payload: Payload, squadIds: readonly number[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>()
  if (!squadIds.length) return out
  const res = await payload.find({ collection: 'squad-members', where: { squad: { in: [...squadIds] } }, limit: 5000, pagination: false, depth: 0, sort: 'id', overrideAccess: true })
  for (const m of res.docs) {
    const squad = idOf(m.squad)
    const player = idOf(m.player)
    if (squad == null || player == null) continue
    out.set(squad, [...(out.get(squad) ?? []), player])
  }
  return out
}

export type FixtureRow = {
  id: number
  gameId: string
  gradeId: string
  gradeName: string
  clubTeamName: string
  roundName: string | null
  localDate: string
  localTime: string | null
  startsAt: string | null
  venueName: string | null
  venueSuburb: string | null
  opponentName: string
  isHome: boolean
  status: 'upcoming' | 'final' | 'removed'
}

/** Upcoming (not removed, not final) fixtures from `fromDate` on, soonest first. */
export async function upcomingFixtures(payload: Payload, fromDate: string, gradeIds?: readonly string[]): Promise<FixtureRow[]> {
  const where: Where = { and: [{ status: { equals: 'upcoming' } }, { localDate: { greater_than_equal: fromDate } }, ...(gradeIds ? [{ gradeId: { in: [...gradeIds] } }] : [])] }
  const res = await payload.find({ collection: 'selection-fixtures', where, limit: 500, pagination: false, depth: 0, sort: ['localDate', 'localTime'], overrideAccess: true })
  return res.docs as unknown as FixtureRow[]
}
