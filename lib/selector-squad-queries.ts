import type { Payload, TypedUser, Where } from 'payload'
import { isStatus, type Answer } from '@/lib/availability'
import { getPayloadClient } from '@/lib/payload/client'
import { clubToday } from '@/lib/selection-fixtures'
import { profilesForPlayers, type ProfileView } from '@/lib/selector-profile-queries'
import { assertSelection } from '@/lib/selector-role'
import { rowSeasonYear } from '@/lib/selection/season'
import { gradeKeyOf, lastSeasonYear, matchesRecency, playedYears, recencyOf, seedFromLastSeason, type Recency, type SeasonRow } from '@/lib/selection/squad-seed'
import { currentSquads, idOf, loadPlayers, membersBySquad, toPlayerLite, upcomingFixtures, type FixtureRow, type PlayerLite, type SquadRow } from '@/lib/selection/store'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { canonicalGrade } from '@/lib/stats/labels'

/**
 * Squad boards (announce-teams spec 4.8): per grade, who is in the squad. One `squad-members` row per membership, so two selectors
 * moving different players never overwrite each other. The reviewed place where the selector area writes squads with
 * `overrideAccess: true`; each function re-checks the caller's role and derives `addedBy` from `user`.
 */
const CTX = { disableRevalidate: true } as const

export type SquadCard = {
  id: number
  slug: string
  name: string
  hidden: boolean
  role: ProfileView['role']
  games: number
  recency: Recency
  /** The next (up to three) fixtures of this grade, oldest first. */
  next: { fixtureId: number; answer: Answer }[]
  /** Other grades this player is also in. */
  alsoIn: string[]
}
export type GradeBoard = { squadId: number; gradeId: string; gradeName: string; cards: SquadCard[]; fixtures: Pick<FixtureRow, 'id' | 'localDate' | 'opponentName'>[] }
export type SquadBoard = { year: number; grades: GradeBoard[] }

type Seasons = { rows: SeasonRow[]; games: Map<number, number> }

/** Season rows with games, for recency tags and this season's game count. */
async function loadSeasonRows(payload: Payload, year: number, playerIds?: readonly number[]): Promise<Seasons> {
  const where: Where = playerIds ? { and: [{ player: { in: [...playerIds] } }, { games: { greater_than: 0 } }] } : { games: { greater_than: 0 } }
  const res = await payload.find({ collection: 'player-seasons', where, limit: 100000, pagination: false, depth: 0, select: { player: true, gradeName: true, games: true, seasonName: true, seasonStartYear: true }, overrideAccess: true })
  const rows: SeasonRow[] = res.docs.map((d) => ({ playerId: idOf(d.player)!, gradeName: d.gradeName, games: d.games, seasonName: d.seasonName, seasonStartYear: (d as { seasonStartYear?: number | null }).seasonStartYear ?? null }))
  const games = new Map<number, number>()
  for (const r of rows) if (rowSeasonYear(r) === year) games.set(r.playerId, (games.get(r.playerId) ?? 0) + (r.games ?? 0))
  return { rows, games }
}

/** Makes sure every grade that has an upcoming fixture has a squad for the current season. Idempotent; the unique index settles a race. */
export async function ensureSquads(payload: Payload, year: number, fixtures: readonly FixtureRow[]): Promise<SquadRow[]> {
  const { squads } = await currentSquads(payload)
  const have = new Set(squads.map((s) => s.gradeId))
  const made: SquadRow[] = []
  for (const f of fixtures) {
    if (have.has(f.gradeId)) continue
    have.add(f.gradeId)
    try {
      made.push((await payload.create({ collection: 'squads', data: { seasonStartYear: year, gradeId: f.gradeId, gradeName: f.gradeName }, overrideAccess: true, context: CTX })) as unknown as SquadRow)
    } catch {
      // another request created it first
    }
  }
  return made.length ? (await currentSquads(payload)).squads : squads
}

export async function loadSquadBoard(user: TypedUser): Promise<SquadBoard> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const year = currentSeasonStartYear()
  const fixtures = await upcomingFixtures(payload, clubToday())
  const squads = await ensureSquads(payload, year, fixtures)
  const bySquad = await membersBySquad(payload, squads.map((s) => s.id))
  const allIds = [...new Set([...bySquad.values()].flat())]
  const [players, profiles, seasons] = await Promise.all([loadPlayers(payload, allIds), profilesForPlayers(user, allIds), loadSeasonRows(payload, year, allIds)])
  const years = playedYears(seasons.rows)
  const gradeOf = new Map<number, string[]>()
  for (const s of squads) for (const pid of bySquad.get(s.id) ?? []) gradeOf.set(pid, [...(gradeOf.get(pid) ?? []), s.gradeName])
  const nextByGrade = new Map<string, FixtureRow[]>()
  for (const f of fixtures) nextByGrade.set(f.gradeId, [...(nextByGrade.get(f.gradeId) ?? []), f].slice(0, 3))
  const answered = new Map<string, Answer>()
  const wanted = [...nextByGrade.values()].flat()
  if (wanted.length && allIds.length) {
    const rows = await payload.find({ collection: 'availability', where: { and: [{ player: { in: allIds } }, { fixture: { in: wanted.map((f) => f.id) } }] } as Where, limit: 20000, pagination: false, depth: 0, overrideAccess: true })
    for (const r of rows.docs) if (isStatus(r.status)) answered.set(`${idOf(r.player)}:${idOf(r.fixture)}`, r.status)
  }
  const grades: GradeBoard[] = squads
    .map((s) => {
      const nexts = nextByGrade.get(s.gradeId) ?? []
      const cards = (bySquad.get(s.id) ?? [])
        .map((pid) => players.get(pid))
        .filter((p): p is PlayerLite => Boolean(p))
        .map<SquadCard>((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          hidden: p.hidden,
          role: profiles.get(p.id)?.role ?? null,
          games: seasons.games.get(p.id) ?? 0,
          recency: recencyOf(years.get(p.id), year),
          next: nexts.map((f) => ({ fixtureId: f.id, answer: answered.get(`${p.id}:${f.id}`) ?? 'none' })),
          alsoIn: (gradeOf.get(p.id) ?? []).filter((g) => g !== s.gradeName),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      return { squadId: s.id, gradeId: s.gradeId, gradeName: s.gradeName, cards, fixtures: nexts.map((f) => ({ id: f.id, localDate: f.localDate, opponentName: f.opponentName })) }
    })
    .sort((a, b) => a.gradeName.localeCompare(b.gradeName))
  return { year, grades }
}

export type MemberResult = { ok: true; changed: number } | { ok: false; error: string }

async function addOne(payload: Payload, user: TypedUser, squadId: number, playerId: number): Promise<boolean> {
  const exists = await payload.find({ collection: 'squad-members', where: { and: [{ squad: { equals: squadId } }, { player: { equals: playerId } }] } as Where, limit: 1, depth: 0, overrideAccess: true })
  if (exists.docs.length) return false
  try {
    await payload.create({ collection: 'squad-members', data: { squad: squadId, player: playerId } as never, user: user as never, overrideAccess: true, context: CTX })
    return true
  } catch {
    // the unique (squad, player) index: someone added them a moment ago
    return false
  }
}

async function squadAndPlayers(payload: Payload, squadId: number, playerIds: readonly number[]): Promise<{ squad: SquadRow; valid: number[] } | null> {
  const squad = (await payload.findByID({ collection: 'squads', id: squadId, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as SquadRow | null
  if (!squad) return null
  const found = await loadPlayers(payload, playerIds)
  return { squad, valid: playerIds.filter((id) => found.has(id)) }
}

export async function addMembers(user: TypedUser, squadId: number, playerIds: readonly number[]): Promise<MemberResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const ids = [...new Set(playerIds.filter((n) => Number.isInteger(n)))].slice(0, 200)
  const ok = await squadAndPlayers(payload, squadId, ids)
  if (!ok) return { ok: false, error: 'That squad was not found.' }
  let changed = 0
  for (const id of ok.valid) if (await addOne(payload, user, squadId, id)) changed += 1
  return { ok: true, changed }
}

export async function removeMember(user: TypedUser, squadId: number, playerId: number): Promise<MemberResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const res = await payload.delete({ collection: 'squad-members', where: { and: [{ squad: { equals: squadId } }, { player: { equals: playerId } }] } as Where, overrideAccess: true, context: CTX })
  return { ok: true, changed: res.docs?.length ?? 0 }
}

/**
 * Moves a player from one squad to another: add to the target first, then take them out of the source. Two moves of different
 * players touch different rows; two moves of the same player settle on the target because the add is idempotent.
 */
export async function moveMember(user: TypedUser, fromSquadId: number, toSquadId: number, playerId: number): Promise<MemberResult> {
  assertSelection(user)
  if (fromSquadId === toSquadId) return { ok: true, changed: 0 }
  const payload = await getPayloadClient()
  const target = await squadAndPlayers(payload, toSquadId, [playerId])
  if (!target || !target.valid.length) return { ok: false, error: 'That squad or player was not found.' }
  await addOne(payload, user, toSquadId, playerId)
  await removeMember(user, fromSquadId, playerId)
  return { ok: true, changed: 1 }
}

export type Candidate = { id: number; name: string; recency: Recency; games: number; hidden: boolean }

/** Players not yet in the squad, filtered by name and recency, for the "Add players" sheet. Capped at 60. */
export async function searchCandidates(user: TypedUser, squadId: number, opts: { q?: string; recency?: Recency | 'all' } = {}): Promise<Candidate[]> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const year = currentSeasonStartYear()
  const members = new Set((await membersBySquad(payload, [squadId])).get(squadId) ?? [])
  const q = (opts.q ?? '').trim().toLowerCase().slice(0, 60)
  const filter = opts.recency ?? 'all'
  const and: Where[] = []
  if (q) and.push({ or: [{ firstName: { like: q } }, { lastName: { like: q } }, { displayName: { like: q } }] })
  if (members.size) and.push({ id: { not_in: [...members] } })
  // The recency filter goes into the query (before the limit), so a long roster is never cut off alphabetically first.
  let seasons: Seasons | null = null
  if (filter !== 'all') {
    seasons = await loadSeasonRows(payload, year)
    const years = playedYears(seasons.rows)
    if (filter === 'never') {
      // "Never" is everyone the other tags do not cover, so it excludes rather than includes.
      const seen = [...years.keys()].filter((id) => recencyOf(years.get(id), year) !== 'never')
      and.push({ id: { not_in: seen } })
    } else {
      const ids = [...years.keys()].filter((id) => !members.has(id) && matchesRecency(recencyOf(years.get(id), year), filter))
      if (!ids.length) return []
      and.push({ id: { in: ids } })
    }
  }
  const res = await payload.find({ collection: 'players', where: and.length ? { and } : {}, limit: 60, pagination: false, depth: 0, joins: false, sort: 'lastName', select: { slug: true, firstName: true, lastName: true, preferredName: true, displayName: true, hidden: true }, overrideAccess: true })
  const candidates = res.docs
  const rows = seasons ?? (await loadSeasonRows(payload, year, candidates.map((p) => p.id)))
  const years = playedYears(rows.rows)
  return candidates
    .map((p) => ({ p: toPlayerLite(p as never), recency: recencyOf(years.get(p.id), year) }))
    .map((c) => ({ id: c.p.id, name: c.p.name, recency: c.recency, games: rows.games.get(c.p.id) ?? 0, hidden: c.p.hidden }))
}

export type SeedPreview = { fromYear: number | null; grades: { squadId: number; gradeName: string; add: { id: number; name: string }[]; already: number }[]; unmatched: string[] }

/**
 * "Start from last season": last season's players grouped by grade, matched to this season's squads by the canonical grade label
 * (so a renamed grade still matches). A preview first; applying never overwrites existing members and only adds.
 */
export async function previewSeed(user: TypedUser, canonical?: (g: string) => string): Promise<SeedPreview> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const year = currentSeasonStartYear()
  const label = canonical ?? (await defaultCanonical())
  const { squads } = await currentSquads(payload)
  const seasons = await loadSeasonRows(payload, year)
  const from = lastSeasonYear(seasons.rows, year)
  if (from == null) return { fromYear: null, grades: [], unmatched: [] }
  const seed = seedFromLastSeason(seasons.rows, from, label)
  const bySquad = await membersBySquad(payload, squads.map((s) => s.id))
  const names = await loadPlayers(payload, [...new Set(seed.flatMap((g) => g.playerIds))])
  const grades: SeedPreview['grades'] = []
  const unmatched: string[] = []
  for (const g of seed) {
    const squad = squads.find((s) => gradeKeyOf(s.gradeName, label) === g.gradeKey)
    if (!squad) {
      unmatched.push(g.gradeKey)
      continue
    }
    const have = new Set(bySquad.get(squad.id) ?? [])
    const add = g.playerIds.filter((id) => !have.has(id) && names.has(id)).map((id) => ({ id, name: names.get(id)!.name }))
    grades.push({ squadId: squad.id, gradeName: squad.gradeName, add: add.sort((a, b) => a.name.localeCompare(b.name)), already: g.playerIds.length - add.length })
  }
  return { fromYear: from, grades: grades.sort((a, b) => a.gradeName.localeCompare(b.gradeName)), unmatched }
}

export async function applySeed(user: TypedUser, canonical?: (g: string) => string): Promise<{ added: number }> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const preview = await previewSeed(user, canonical)
  let added = 0
  for (const g of preview.grades) for (const p of g.add) if (await addOne(payload, user, g.squadId, p.id)) added += 1
  return { added }
}

async function defaultCanonical(): Promise<(g: string) => string> {
  const { getLabelMap } = await import('@/lib/stats/label-queries')
  const map = await getLabelMap()
  return (g) => canonicalGrade(g, map)
}
