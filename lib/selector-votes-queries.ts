import type { Payload, TypedUser, Where } from 'payload'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { clubToday } from '@/lib/selection-fixtures'
import { getPayloadClient } from '@/lib/payload/client'
import { assertSelection } from '@/lib/selector-role'
import { idOf, loadPlayers } from '@/lib/selection/store'
import { isAdminUser, isStaffUser } from '@/payload/access'
import {
  computeBoard,
  CTX,
  findVoteFixture,
  finalFixturesInSeason,
  getVoteSettings,
  nomineesByFixture,
  seasonsWithGames,
  writeBallot,
  type BoardData,
  type VoteFixtureRow,
} from '@/lib/votes-queries'
import { placesRequired, validateBallot, type BallotPick } from '@/lib/votes/ballot'
import { buildSnapshot, type PresentSnapshot } from '@/lib/votes/present'
import { ballotValuesLabel, parseBallotValues, pinWarning, suggestedMinimum, type VoteSettings } from '@/lib/votes/settings'
import { addDays, voteStatus, type VoteStatus } from '@/lib/votes/status'
import { votesCsv } from '@/lib/votes/csv'

/**
 * The selector area's side of best-player votes (wave B spec 3.7). Every function re-checks the caller's role first. Nothing here
 * returns a (voter, picks) pair: participation says WHO has voted (and whether a selector entered it), never for whom. Ballots are
 * read only for the names/sources, with `picks` left out of the selection.
 */
type Done = { ok: true } | { ok: false; error: string }
const WRONG: Done = { ok: false, error: 'Something went wrong. Please try again.' }
const NOT_ALLOWED: Done = { ok: false, error: 'Only the committee (admins and editors) can do that.' }

export type VoteGameRow = {
  id: number
  gradeName: string
  roundName: string | null
  opponentName: string
  localDate: string
  status: VoteStatus
  votesState: VoteFixtureRow['votesState']
  countsForAwards: boolean
  eligible: number
  voted: number
  enteredBySelector: number
  counts: boolean
  needed: number
}

type Participation = { name: string; playerId: number | null; source: 'voter' | 'selector'; castAt: string | null }

/** Who voted in a game: names and source only. `picks` is not selected. */
async function participation(payload: Payload, fixtureIds: readonly number[]): Promise<Map<number, Participation[]>> {
  const out = new Map<number, Participation[]>()
  if (!fixtureIds.length) return out
  const res = await payload.find({
    collection: 'best-player-ballots',
    where: { fixture: { in: [...fixtureIds] } } as Where,
    select: { fixture: true, voter: true, source: true, castAt: true },
    limit: 20000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const rows = res.docs as unknown as { fixture: unknown; voter: unknown; source: string; castAt?: string | null }[]
  const voterIds = rows.map((r) => idOf(r.voter)).filter((n): n is number => n != null)
  const names = await loadPlayers(payload, voterIds)
  for (const r of rows) {
    const fid = idOf(r.fixture)
    if (fid == null) continue
    const pid = idOf(r.voter)
    out.set(fid, [...(out.get(fid) ?? []), { name: pid != null ? (names.get(pid)?.name ?? 'Unknown') : 'A selector', playerId: pid, source: r.source === 'selector' ? 'selector' : 'voter', castAt: r.castAt ?? null }])
  }
  return out
}

/** For the Overview: is voting on, and how many finished games can still be voted on. Cheap (no participation counts). */
export async function votesOverview(user: TypedUser, now: Date = new Date()): Promise<{ enabled: boolean; openGames: number }> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const settings = await getVoteSettings(payload)
  if (!settings.enabled) return { enabled: false, openGames: 0 }
  const res = await payload.find({
    collection: 'selection-fixtures',
    where: { and: [{ status: { equals: 'final' } }, { or: [{ localDate: { greater_than_equal: addDays(clubToday(now), -(settings.voteWindowDays + 1)) } }, { votesState: { equals: 'open' } }] }] } as Where,
    limit: 200,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const open = (res.docs as unknown as Record<string, unknown>[]).filter((f) => f.countsForAwards !== false && voteStatus({ status: 'final', localDate: String(f.localDate), votesState: f.votesState as string }, settings, now) === 'open')
  return { enabled: true, openGames: open.length }
}

/** The games to look after: this season's finished games (newest first) with how many have voted. */
export async function loadVotesHome(user: TypedUser, now: Date = new Date()): Promise<{ settings: VoteSettings; games: VoteGameRow[]; isStaff: boolean; isAdmin: boolean }> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const settings = await getVoteSettings(payload)
  const season = currentSeasonStartYear(now)
  const fixtures = (await finalFixturesInSeason(payload, season)).reverse().slice(0, 60)
  const [nominees, parts] = await Promise.all([nomineesByFixture(payload, fixtures), participation(payload, fixtures.map((f) => f.id))])
  const games: VoteGameRow[] = fixtures.map((f) => {
    const p = parts.get(f.id) ?? []
    return {
      id: f.id,
      gradeName: f.gradeName,
      roundName: f.roundName,
      opponentName: f.opponentName,
      localDate: f.localDate,
      status: voteStatus(f, settings, now),
      votesState: f.votesState,
      countsForAwards: f.countsForAwards,
      eligible: nominees.get(f.id)?.length ?? 0,
      voted: p.filter((x) => x.source === 'voter').length,
      enteredBySelector: p.filter((x) => x.source === 'selector').length,
      counts: p.length >= settings.minBallotsToCount && f.countsForAwards,
      needed: settings.minBallotsToCount,
    }
  })
  return { settings, games, isStaff: isStaffUser(user), isAdmin: isAdminUser(user) }
}

export type VoteGameDetail = {
  game: VoteGameRow
  settings: VoteSettings
  voted: { name: string; entered: boolean; castAt: string | null }[]
  chase: { id: number; name: string; slug: string }[]
  myEntryExists: boolean
  form: { options: { id: number; name: string }[]; values: number[]; places: number } | null
  isStaff: boolean
}

export async function loadVoteGame(user: TypedUser, fixtureId: number, now: Date = new Date()): Promise<VoteGameDetail | null> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const settings = await getVoteSettings(payload)
  const fixture = await findVoteFixture(payload, fixtureId)
  if (!fixture || fixture.status !== 'final') return null
  const [nominees, parts] = await Promise.all([nomineesByFixture(payload, [fixture]), participation(payload, [fixture.id])])
  const ids = nominees.get(fixture.id) ?? []
  const people = await loadPlayers(payload, ids)
  const p = parts.get(fixture.id) ?? []
  const votedIds = new Set(p.map((x) => x.playerId).filter((n): n is number => n != null))
  const mine = await payload.find({ collection: 'best-player-ballots', where: { and: [{ fixture: { equals: fixture.id } }, { voterKey: { equals: `selector:${user.id}` } }] } as Where, select: { revision: true }, limit: 1, depth: 0, overrideAccess: true })
  const status = voteStatus(fixture, settings, now)
  const options = [...people.values()].sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ id: x.id, name: x.name }))
  return {
    game: {
      id: fixture.id,
      gradeName: fixture.gradeName,
      roundName: fixture.roundName,
      opponentName: fixture.opponentName,
      localDate: fixture.localDate,
      status,
      votesState: fixture.votesState,
      countsForAwards: fixture.countsForAwards,
      eligible: ids.length,
      voted: p.filter((x) => x.source === 'voter').length,
      enteredBySelector: p.filter((x) => x.source === 'selector').length,
      counts: p.length >= settings.minBallotsToCount && fixture.countsForAwards,
      needed: settings.minBallotsToCount,
    },
    settings,
    voted: p.map((x) => ({ name: x.name, entered: x.source === 'selector', castAt: x.castAt })).sort((a, b) => a.name.localeCompare(b.name)),
    chase: [...people.values()].filter((x) => !votedIds.has(x.id)).sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ id: x.id, name: x.name, slug: x.slug })),
    myEntryExists: mine.docs.length > 0,
    form: status === 'open' && options.length ? { options, values: settings.ballotValues, places: placesRequired(settings.ballotValues.length, options.length) } : null,
    isStaff: isStaffUser(user),
  }
}

/**
 * A selector enters a ballot on someone's behalf (phone calls, coaches, umpires). One per selector per game; saving replaces the
 * selector's own earlier entry without showing it. The key and `castBy` come from the signed-in user.
 */
export async function enterSelectorBallot(user: TypedUser, fixtureId: number, picks: readonly BallotPick[] | null, now: Date = new Date()): Promise<Done> {
  assertSelection(user)
  const payload = await getPayloadClient()
  if (!Number.isInteger(fixtureId) || !picks) return WRONG
  const settings = await getVoteSettings(payload)
  if (!settings.enabled) return { ok: false, error: 'Voting is switched off.' }
  const fixture = await findVoteFixture(payload, fixtureId)
  if (!fixture || !fixture.countsForAwards) return WRONG
  if (voteStatus(fixture, settings, now) !== 'open') return { ok: false, error: 'Voting is closed for this game. Reopen it first.' }
  const nominees = (await nomineesByFixture(payload, [fixture])).get(fixture.id) ?? []
  const checked = validateBallot(picks, nominees, settings.ballotValues.length, null, true)
  if (!checked.ok) return { ok: false, error: checked.message }
  await writeBallot(payload, { fixtureId: fixture.id, voterKey: `selector:${user.id}`, voterPlayerId: null, picks: checked.picks, source: 'selector', castBy: Number(user.id), now })
  return { ok: true }
}

/** Open, close or exclude one game. Writes `votesState` / `countsForAwards` (the collection is closed to REST, so only code writes them). */
export async function setGameVotes(user: TypedUser, fixtureId: number, patch: { votesState?: unknown; countsForAwards?: unknown }): Promise<Done> {
  assertSelection(user)
  // These switches change the public board at once, so only staff (admin or editor) may use them; a selector is refused.
  if (!isStaffUser(user)) return { ok: false, error: 'Only a committee member can change a game\'s voting state.' }
  const payload = await getPayloadClient()
  const data: Record<string, unknown> = {}
  if (patch.votesState !== undefined) {
    if (patch.votesState !== 'auto' && patch.votesState !== 'open' && patch.votesState !== 'closed') return WRONG
    data.votesState = patch.votesState
  }
  if (patch.countsForAwards !== undefined) {
    if (typeof patch.countsForAwards !== 'boolean') return WRONG
    data.countsForAwards = patch.countsForAwards
  }
  if (!Object.keys(data).length || !Number.isInteger(fixtureId)) return WRONG
  const fixture = await findVoteFixture(payload, fixtureId)
  if (!fixture || fixture.status !== 'final') return WRONG
  await payload.update({ collection: 'selection-fixtures', id: fixture.id, data: data as never, overrideAccess: true, context: CTX })
  return { ok: true }
}

export type PrivateBoard = { board: BoardData; seasons: number[] }

/** The selectors' own leaderboard: counted games, window open or closed, clearly labelled private. */
export async function loadPrivateBoard(user: TypedUser, o: { season?: number | null; gradeId?: string | null; locale: string; now?: Date }): Promise<PrivateBoard> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const [board, seasons] = await Promise.all([computeBoard(payload, { ...o, audience: 'private' }), seasonsWithGames(payload, o.now)])
  return { board, seasons }
}

/** The awards-night data: public-eligible only, cumulative by closed round. Behind the selector login, not public. */
export async function loadPresentSnapshot(user: TypedUser, o: { season?: number | null; gradeId?: string | null; locale: string; title: string; now?: Date }): Promise<{ snapshot: PresentSnapshot; empty: boolean; enabled: boolean }> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const board = await computeBoard(payload, { season: o.season, gradeId: o.gradeId, locale: o.locale, now: o.now, audience: 'public' })
  const scopeLabel = board.gradeName ?? 'Whole club'
  const snapshot = buildSnapshot({ title: o.title, scopeLabel, valuesLabel: `Points ${ballotValuesLabel(board.settings.ballotValues)}`, boards: board.result.boards, roundLabel: (k) => board.roundLabels[k] ?? k })
  return { snapshot, empty: board.result.boards.length === 0, enabled: board.settings.enabled }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Settings (committee only: admin or editor). Selectors can read, not change.
// ---------------------------------------------------------------------------------------------------------------------------

export type VoteSettingsView = { settings: VoteSettings; canEdit: boolean; defaultPinPlayers: number; pinWarning: string | null; averageVoters: number; suggestedMinimum: number }

async function defaultPinCount(payload: Payload): Promise<number> {
  const res = await payload.count({ collection: 'player-selection-profiles', where: { pinSource: { equals: 'phone' } } as Where, overrideAccess: true })
  return res.totalDocs
}

export async function loadVoteSettingsView(user: TypedUser, now: Date = new Date()): Promise<VoteSettingsView> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const settings = await getVoteSettings(payload)
  const recent = (await finalFixturesInSeason(payload, currentSeasonStartYear(now))).slice(-6)
  const nominees = await nomineesByFixture(payload, recent)
  const sizes = recent.map((f) => nominees.get(f.id)?.length ?? 0).filter((n) => n > 0)
  const avg = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0
  const pins = await defaultPinCount(payload)
  return { settings, canEdit: isStaffUser(user), defaultPinPlayers: pins, pinWarning: pinWarning(pins), averageVoters: Math.round(avg), suggestedMinimum: suggestedMinimum(avg) }
}

export type SettingsInput = { enabled?: unknown; allowSelfVote?: unknown; ballotValues?: unknown; tieBreakFewestGames?: unknown; voteWindowDays?: unknown; editWindowHours?: unknown; minBallotsToCount?: unknown; publicLeaderboard?: unknown; publicScope?: unknown; publicShowBreakdown?: unknown }

const wholeNumber = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null
}

/** Committee only: the REST update on the global stays admin-only; this is the reviewed seam by which editors change vote options. */
export async function saveVoteSettings(user: TypedUser, input: SettingsInput): Promise<Done & { warning?: string | null }> {
  assertSelection(user)
  if (!isStaffUser(user)) return NOT_ALLOWED
  const values = parseBallotValues(input.ballotValues)
  const windowDays = wholeNumber(input.voteWindowDays, 1, 60)
  const editHours = wholeNumber(input.editWindowHours, 0, 336)
  const min = wholeNumber(input.minBallotsToCount, 3, 100)
  const scope = input.publicScope === 'club' || input.publicScope === 'grade' || input.publicScope === 'both' ? input.publicScope : null
  if (!values) return { ok: false, error: 'Points must be whole numbers from highest to lowest, at most 5, for example 3,2,1.' }
  if (windowDays == null) return { ok: false, error: 'Days voting stays open must be a whole number from 1 to 60.' }
  if (editHours == null) return { ok: false, error: 'Hours a player can change their vote must be a whole number from 0 to 336.' }
  if (min == null) return { ok: false, error: 'Votes needed before a game counts must be a whole number from 3 to 100.' }
  if (!scope) return WRONG
  const payload = await getPayloadClient()
  const flag = (v: unknown) => v === true || v === 'on' || v === 'true'
  await payload.updateGlobal({
    slug: 'selection-settings',
    data: {
      votes: {
        enabled: flag(input.enabled),
        allowSelfVote: flag(input.allowSelfVote),
        ballotValues: values.join(','),
        tieBreakFewestGames: flag(input.tieBreakFewestGames),
        voteWindowDays: windowDays,
        editWindowHours: editHours,
        minBallotsToCount: min,
        publicLeaderboard: flag(input.publicLeaderboard),
        publicScope: scope,
        publicShowBreakdown: flag(input.publicShowBreakdown),
      },
    } as never,
    overrideAccess: true,
    context: CTX,
  })
  return { ok: true, warning: flag(input.enabled) ? pinWarning(await defaultPinCount(payload)) : null }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Admin only: audit of who voted (never for whom), delete one ballot, season totals CSV.
// ---------------------------------------------------------------------------------------------------------------------------

export type AuditRow = { name: string; playerId: number | null; source: 'voter' | 'selector'; castAt: string | null }

/** Who has voted in a game. Never selects `picks`. Logs who looked, because it is the only view of voter identities. */
export async function auditVoters(user: TypedUser, fixtureId: number): Promise<AuditRow[] | null> {
  assertSelection(user)
  if (!isAdminUser(user)) return null
  const payload = await getPayloadClient()
  const rows = (await participation(payload, [fixtureId])).get(fixtureId) ?? []
  console.info(`[votes] audit of voters for fixture ${fixtureId} by user ${user.id}`)
  return rows.map((r) => ({ name: r.name, playerId: r.playerId, source: r.source, castAt: r.castAt })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Deletes one player's ballot for a game (a dispute) so they can vote again inside the window. Does not read the picks. */
export async function deleteBallot(user: TypedUser, fixtureId: number, playerId: number): Promise<Done> {
  assertSelection(user)
  if (!isAdminUser(user)) return NOT_ALLOWED
  const payload = await getPayloadClient()
  if (!Number.isInteger(fixtureId) || !Number.isInteger(playerId)) return WRONG
  const res = await payload.delete({ collection: 'best-player-ballots', where: { and: [{ fixture: { equals: fixtureId } }, { voterKey: { equals: `player:${playerId}` } }] } as Where, overrideAccess: true, context: CTX })
  console.info(`[votes] ballot of player ${playerId} for fixture ${fixtureId} deleted by user ${user.id}`)
  return res.docs.length ? { ok: true } : { ok: false, error: 'That player has not voted in this game.' }
}

/** Season totals per player (never individual ballots), admin only. Counts every counted game, closed or not, as the private board does. */
export async function exportVotesCsv(user: TypedUser, o: { season?: number | null; gradeId?: string | null; locale: string }): Promise<{ slug: string; body: string } | null> {
  assertSelection(user)
  if (!isAdminUser(user)) return null
  const payload = await getPayloadClient()
  const board = await computeBoard(payload, { ...o, audience: 'private' })
  const season = `${board.scope.season}/${String(board.scope.season + 1).slice(2)}`
  const body = votesCsv(board.result.rows, board.settings.ballotValues, { scope: board.gradeName ?? 'Whole club', season })
  return { slug: `votes-${board.scope.season}${board.gradeName ? `-${board.gradeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`, body }
}
