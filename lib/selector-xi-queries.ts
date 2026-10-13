import 'server-only'
import type { Payload, TypedUser, Where } from 'payload'
import { SEASON_START_MONTH, SELECTION } from '@/config/site'
import { isStatus, type Answer } from '@/lib/availability'
import { getPayloadClient } from '@/lib/payload/client'
import { FORM_COUNT, FORM_WINDOW_DAYS } from '@/lib/selection/form'
import { loadInsights } from '@/lib/selection/insights'
import { effectiveRole, type Role, type RoleOrUnknown } from '@/lib/selection/roles'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { currentSquads, getSelectionSettings, idOf, loadPlayers, membersBySquad, type FixtureRow, type XiRules } from '@/lib/selection/store'
import { buildSnapshot, describeDiff, diffSnapshots, isXiSize, type Slot, type XiSize } from '@/lib/selection/team-sheet'
import { teamWarnings, type Warning } from '@/lib/selection/warnings'
import { suggestXi, type XiPlayer, type XiResult } from '@/lib/selection/xi'
import { profilesForPlayers } from '@/lib/selector-profile-queries'
import { assertSelection } from '@/lib/selector-role'
import { fixtureByGameId, saveSheet, type SaveSheetResult } from '@/lib/selector-team-queries'

/**
 * The best XI suggester for the selector area (wave E, WP-2). Reads only: the squad of the game's grade for this season, their
 * availability for this game, stored last-five lines and batting positions, and the draft team already saved. Nothing is written
 * except by `applySuggestion`, which goes through the existing `saveSheet` (a draft, revision-checked); this module has no publish,
 * announcement, email or social code. Every exported function starts with `assertSelection`; reads use the Local API with
 * `overrideAccess: true` because selectors get nothing over REST.
 *
 * The pool is the grade's squad minus hidden players. A hidden player is dropped before anything is built, so their name, id and
 * existence are in no result, and a `pin` / `leave` / `keeper` id that is not in the pool is ignored without being echoed.
 */
const CHUNK = 400
const MAX_IDS = 30

type SheetDoc = { id: number; slots?: { player?: unknown; guestName?: string | null; order: number; isCaptain?: boolean | null; isKeeper?: boolean | null }[] | null; size?: number | null; revision?: number | string | null; publishedAt?: string | null }

/** `?pin=1,2&pin=3` to unique positive integers (at most 30); anything else is dropped. */
export function parseIdList(raw: string | readonly string[] | undefined | null): number[] {
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((v) => (typeof v === 'string' ? v.split(',') : []))
  const out: number[] = []
  for (const part of parts) {
    const t = part.trim()
    if (!/^\d{1,9}$/.test(t)) continue
    const n = Number(t)
    if (n > 0 && !out.includes(n)) out.push(n)
    if (out.length >= MAX_IDS) break
  }
  return out
}

export type SuggestionParams = { pin?: string | readonly string[]; leave?: string | readonly string[]; keeper?: string | readonly string[] }

export type SuggestionView = {
  fixture: FixtureRow
  /** The saved team's revision: the page hands it back to "Use this XI", and a stale one is refused. */
  revision: number
  size: XiSize
  rules: XiRules
  result: XiResult
  warnings: Warning[]
  /** What would change against the saved team, as short sentences. Empty when there is no saved team. */
  changes: string[]
  savedCount: number
  /** A team is published and stays public until a selector publishes again. */
  published: boolean
  /** The page's own state after validation against the pool. */
  state: { pins: number[]; leaves: number[]; keeperId: number | null }
  /** The saved captain, kept when that player is still in the proposal. */
  captainId: number | null
}

type Pool = { fixture: FixtureRow; squadMembers: number[]; players: Map<number, { id: number; name: string; hidden: boolean }> }

async function loadPool(payload: Payload, gameId: string): Promise<Pool | null> {
  const fixture = (await fixtureByGameId(payload, gameId)) as FixtureRow | null
  if (!fixture) return null
  const { squads } = await currentSquads(payload)
  const squad = squads.find((s) => s.gradeId === fixture.gradeId)
  const memberIds = squad ? ((await membersBySquad(payload, [squad.id])).get(squad.id) ?? []) : []
  const players = await loadPlayers(payload, memberIds)
  // Hidden players are dropped here, before anything else is derived from the pool.
  const squadMembers = [...new Set(memberIds)].filter((id) => players.has(id) && !players.get(id)!.hidden)
  return { fixture, squadMembers, players }
}

/** Other games on the same day: player id to the grade of a side they are already picked in (saved drafts count). */
async function pickedElsewhere(payload: Payload, fixture: FixtureRow): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const others = (await payload.find({ collection: 'selection-fixtures', where: { and: [{ localDate: { equals: fixture.localDate } }, { status: { not_equals: 'removed' } }, { id: { not_equals: fixture.id } }] } as Where, limit: 200, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as FixtureRow[]
  if (!others.length) return out
  const byId = new Map(others.map((f) => [f.id, f]))
  const sheets = (await payload.find({ collection: 'team-sheets', where: { fixture: { in: others.map((f) => f.id) } } as Where, limit: 200, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as (SheetDoc & { fixture: unknown })[]
  for (const s of sheets) {
    const gradeName = byId.get(idOf(s.fixture) ?? -1)?.gradeName
    if (!gradeName) continue
    for (const sl of s.slots ?? []) {
      const pid = idOf(sl.player)
      if (pid != null && !out.has(pid)) out.set(pid, gradeName)
    }
  }
  return out
}

/** Stored batting positions (last five innings) and games played this season, per player. */
async function loadFormExtras(payload: Payload, ids: readonly number[], now: Date = new Date()): Promise<Map<number, { positions: number[]; games: number }>> {
  const out = new Map<number, { positions: number[]; games: number }>(ids.map((id) => [id, { positions: [], games: 0 }]))
  if (!ids.length) return out
  const cutoff = new Date(now.getTime() - FORM_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const seasonStart = `${currentSeasonStartYear(now)}-${String(SEASON_START_MONTH).padStart(2, '0')}-01`
  const since = cutoff < seasonStart ? cutoff : seasonStart
  const matches = await payload.find({ collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, { localDate: { greater_than_equal: since } }] } as Where, limit: 5000, pagination: false, depth: 0, select: { localDate: true }, overrideAccess: true })
  const dateOf = new Map<number, string>(matches.docs.map((m) => [m.id, (m as { localDate?: string | null }).localDate ?? '']))
  const matchIds = [...dateOf.keys()]
  if (!matchIds.length) return out
  const rows = await payload.find({ collection: 'match-appearances', where: { and: [{ player: { in: [...ids] } }, { match: { in: matchIds } }] } as Where, limit: 20000, pagination: false, depth: 0, select: { match: true, appearanceId: true, player: true }, overrideAccess: true })
  const who = new Map<string, { playerId: number; date: string }>()
  const seasonGames = new Map<number, Set<number>>()
  for (const a of rows.docs) {
    const match = idOf(a.match)
    const player = idOf(a.player)
    if (match == null || player == null) continue
    const date = dateOf.get(match) ?? ''
    who.set(`${match}:${a.appearanceId}`, { playerId: player, date })
    if (date >= seasonStart) seasonGames.set(player, (seasonGames.get(player) ?? new Set()).add(match))
  }
  for (const [player, games] of seasonGames) out.get(player)!.games = games.size

  const found = new Map<number, { date: string; pos: number }[]>()
  const appearanceIds = [...new Set([...who.keys()].map((k) => k.slice(k.indexOf(':') + 1)))]
  for (let i = 0; i < appearanceIds.length; i += CHUNK) {
    const part = appearanceIds.slice(i, i + CHUNK)
    const batting = await payload.find({ collection: 'match-batting', where: { and: [{ match: { in: matchIds } }, { appearanceId: { in: part } }] } as Where, limit: 20000, pagination: false, depth: 0, select: { match: true, appearanceId: true, position: true, runs: true, battingStatus: true }, overrideAccess: true })
    for (const b of batting.docs) {
      const p = who.get(`${idOf(b.match)}:${b.appearanceId}`)
      if (!p || p.date < cutoff || b.battingStatus === 'did_not_bat' || b.battingStatus === 'unknown' || typeof b.runs !== 'number') continue
      // The same innings the "last five bats" line counts; one without a recorded position still counts there but gives no position.
      found.set(p.playerId, [...(found.get(p.playerId) ?? []), { date: p.date, pos: typeof b.position === 'number' && b.position > 0 ? b.position : 0 }])
    }
  }
  for (const [player, list] of found) out.get(player)!.positions = list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, FORM_COUNT).map((x) => x.pos).filter((n) => n > 0)
  return out
}

async function loadSheet(payload: Payload, fixtureId: number): Promise<SheetDoc | undefined> {
  return (await payload.find({ collection: 'team-sheets', where: { fixture: { equals: fixtureId } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as SheetDoc | undefined
}

const sheetSize = (sheet: SheetDoc | undefined, fallback: XiSize): XiSize => (sheet && sheet.size != null && isXiSize(Number(sheet.size)) ? (Number(sheet.size) as XiSize) : fallback)

export async function loadSuggestion(user: TypedUser, gameId: string, params: SuggestionParams = {}): Promise<SuggestionView | null> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const pool = await loadPool(payload, gameId)
  if (!pool) return null
  const { fixture } = pool
  const settings = await getSelectionSettings(payload)
  const sheet = await loadSheet(payload, fixture.id)
  const size = sheetSize(sheet, settings.defaultXiSize)

  const ids = pool.squadMembers
  const inPool = new Set(ids)
  const [profiles, insights, extras, elsewhere] = await Promise.all([profilesForPlayers(user, ids), loadInsights(payload, ids), loadFormExtras(payload, ids), pickedElsewhere(payload, fixture)])
  const answers = new Map<number, Answer>()
  if (ids.length) {
    const rows = await payload.find({ collection: 'availability', where: { and: [{ player: { in: ids } }, { fixture: { equals: fixture.id } }] } as Where, limit: ids.length + 1, pagination: false, depth: 0, overrideAccess: true })
    for (const r of rows.docs) if (isStatus(r.status)) answers.set(idOf(r.player)!, r.status)
  }

  const players: XiPlayer[] = ids.map((id) => {
    const prof = profiles.get(id)
    const ins = insights.get(id)
    const stored = (prof?.role ?? null) as Role | null
    const keeps = Boolean(prof?.canKeep)
    const suggested: RoleOrUnknown = keeps ? 'keeper' : ins?.suggested ?? 'unknown'
    return {
      id,
      name: pool.players.get(id)!.name,
      role: effectiveRole(stored, suggested),
      roleSource: stored != null || keeps ? 'selectors' : 'stats',
      answer: answers.get(id) ?? 'none',
      alsoPickedIn: elsewhere.get(id) ?? null,
      battingEntries: ins?.battingEntries ?? [],
      bowlingEntries: ins?.bowlingEntries ?? [],
      gamesThisSeason: extras.get(id)?.games ?? 0,
      positions: extras.get(id)?.positions ?? [],
    }
  })

  const keeperId = parseIdList(params.keeper).find((id) => inPool.has(id)) ?? null
  const pins = parseIdList(params.pin).filter((id) => inPool.has(id) && id !== keeperId)
  const leaves = parseIdList(params.leave).filter((id) => inPool.has(id) && !pins.includes(id) && id !== keeperId)
  const result = suggestXi({ players, rules: settings.xi, size, pins, leaves, keeperId })

  const savedSlots: Slot[] = (sheet?.slots ?? []).map((s) => ({ ...(idOf(s.player) != null ? { player: idOf(s.player)! } : {}), ...(s.guestName ? { guestName: s.guestName } : {}), order: Number(s.order), isCaptain: Boolean(s.isCaptain), isKeeper: Boolean(s.isKeeper) }))
  const captainId = savedSlots.find((s) => s.isCaptain && s.player != null && result.picks.some((p) => p.id === s.player))?.player ?? null
  const byId = new Map(players.map((p) => [p.id, p]))
  const warnings = teamWarnings(
    {
      slots: result.picks.map((p) => ({ name: p.name, kind: 'player' as const, role: p.role, isCaptain: p.id === captainId, isKeeper: p.isKeeper, answer: byId.get(p.id)?.answer ?? 'none', alsoPickedIn: byId.get(p.id)?.alsoPickedIn ?? null })),
      size: result.size as XiSize,
      fixtureStatus: fixture.status,
      fixtureMovedSinceSave: false,
    },
    settings.xi,
  )

  let changes: string[] = []
  if (savedSlots.length) {
    const prev = buildSnapshot({ slots: savedSlots, size, revision: 0 }, '')
    const next = buildSnapshot({ slots: result.picks.map((p) => ({ player: p.id, order: p.order, isCaptain: p.id === captainId, isKeeper: p.isKeeper })), size, revision: 0 }, '').slots
    const nameOf = (s: { playerId?: number; guestName?: string }) => (s.playerId != null ? pool.players.get(s.playerId)?.name ?? 'A player' : s.guestName ?? '')
    changes = describeDiff(diffSnapshots(prev, { slots: next }), nameOf)
  }
  return { fixture, revision: Number(sheet?.revision ?? 0), size, rules: settings.xi, result, warnings, changes, savedCount: savedSlots.length, published: Boolean(sheet?.publishedAt), state: { pins, leaves, keeperId }, captainId }
}

export type ApplyInput = { gameId: string; expectedRevision: number; playerIds: number[]; keeperId: number | null; captainId: number | null }

/**
 * "Use this XI": saves the proposal as the working team through `saveSheet` (revision-checked, one transaction). It never publishes,
 * announces or notifies; a published team keeps its public snapshot until a selector publishes again. The picks must all be in the
 * grade's pool (not hidden), so a forged request cannot put anyone else into a team.
 */
export async function applySuggestion(user: TypedUser, input: ApplyInput): Promise<SaveSheetResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const pool = await loadPool(payload, input.gameId)
  if (!pool) return { ok: false, error: 'That game was not found.' }
  const ids = input.playerIds
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > SELECTION.xi.openTeamSize + 2 || new Set(ids).size !== ids.length || ids.some((id) => !Number.isInteger(id))) return { ok: false, error: 'Something went wrong. Reload and try again.' }
  const inPool = new Set(pool.squadMembers)
  if (ids.some((id) => !inPool.has(id))) return { ok: false, error: 'One of those players is not in this grade’s squad. Reload and try again.' }
  const sheet = await loadSheet(payload, pool.fixture.id)
  const settings = await getSelectionSettings(payload)
  return saveSheet(user, {
    gameId: input.gameId,
    expectedRevision: input.expectedRevision,
    size: sheetSize(sheet, settings.defaultXiSize),
    markedReady: false,
    slots: ids.map((id) => ({ playerId: id, isKeeper: id === input.keeperId, isCaptain: id === input.captainId })),
  })
}
