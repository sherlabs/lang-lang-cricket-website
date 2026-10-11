import type { Payload, Where } from 'payload'
import { SEASON_START_MONTH, VOTES } from '@/config/site'
import { LOCKED_MESSAGE } from '@/lib/availability-throttle'
import { rememberedPlayer, resolveLink } from '@/lib/availability-public'
import { clubToday } from '@/lib/selection-fixtures'
import { parseSnapshot } from '@/lib/selection/team-sheet'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { idOf, loadPlayers, type PlayerLite } from '@/lib/selection/store'
import { weekendKey } from '@/lib/selection/weekend'
import { hit, type ThrottleRule } from '@/lib/throttle'
import { BALLOT_MESSAGES, nomineesFor, pickableFor, placesRequired, validateBallot, type BallotError, type BallotPick } from '@/lib/votes/ballot'
import { settingsFrom, type VoteSettings } from '@/lib/votes/settings'
import { addDays, editWindowOpen, isCounting, seasonStartYearOfDate, voteStatus, type VoteFixture } from '@/lib/votes/status'
import { tally, type PlayerInfo, type TallyBallot, type TallyFixture, type TallyResult } from '@/lib/votes/tally'

/**
 * Best-player votes: shared reads, the player's own ballot flow and the public leaderboard (wave B spec 3). Runs with the Local API's
 * access override, so every caller has already proved who is asking (the signed availability cookie, `requireSelection()` in the
 * selector area). Staff and selector functions live in `lib/selector-votes-queries.ts`.
 *
 * Two hard rules: no function here returns a (voter, picks) pair to anyone but that voter about their own ballot, and every query
 * for the public states its own filter (votes switched on, leaderboard switched on, scope allowed, windows closed, hidden players out).
 */

export const CTX = { disableRevalidate: true } as const
export { CTX as VOTE_CTX }

export async function getVoteSettings(payload: Payload): Promise<VoteSettings> {
  const g = await payload.findGlobal({ slug: 'selection-settings', depth: 0, overrideAccess: true })
  return settingsFrom(g)
}

export type VoteFixtureRow = VoteFixture & {
  id: number
  gameId: string
  gradeId: string
  gradeName: string
  roundName: string | null
  opponentName: string
  clubTeamName: string
  votesState: 'auto' | 'open' | 'closed'
  countsForAwards: boolean
}

type RawFixture = Record<string, unknown> & { id: number }
const toFixture = (f: RawFixture): VoteFixtureRow => ({
  id: f.id,
  gameId: String(f.gameId ?? ''),
  gradeId: String(f.gradeId ?? ''),
  gradeName: String(f.gradeName ?? ''),
  roundName: (f.roundName as string | null) ?? null,
  opponentName: String(f.opponentName ?? ''),
  clubTeamName: String(f.clubTeamName ?? ''),
  localDate: String(f.localDate ?? ''),
  status: String(f.status ?? ''),
  votesState: f.votesState === 'open' || f.votesState === 'closed' ? f.votesState : 'auto',
  countsForAwards: f.countsForAwards !== false,
})

export async function findVoteFixture(payload: Payload, id: number): Promise<VoteFixtureRow | null> {
  if (!Number.isInteger(id) || id < 1) {
    // Same work for a nonsense id: one lookup that finds nothing.
    await payload.find({ collection: 'selection-fixtures', where: { id: { equals: -1 } }, limit: 1, depth: 0, overrideAccess: true })
    return null
  }
  const res = await payload.find({ collection: 'selection-fixtures', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true })
  const f = res.docs[0] as unknown as RawFixture | undefined
  return f ? toFixture(f) : null
}

/** First day (inclusive) and day after the last (exclusive) of a season, as club-local dates. */
export function seasonRange(startYear: number, startMonth: number = SEASON_START_MONTH): { from: string; to: string } {
  const m = String(startMonth).padStart(2, '0')
  return { from: `${startYear}-${m}-01`, to: `${startYear + 1}-${m}-01` }
}

export async function finalFixturesInSeason(payload: Payload, startYear: number): Promise<VoteFixtureRow[]> {
  const { from, to } = seasonRange(startYear)
  const res = await payload.find({
    collection: 'selection-fixtures',
    where: { and: [{ status: { equals: 'final' } }, { localDate: { greater_than_equal: from } }, { localDate: { less_than: to } }] } as Where,
    limit: 2000,
    pagination: false,
    depth: 0,
    sort: ['localDate', 'id'],
    overrideAccess: true,
  })
  return (res.docs as unknown as RawFixture[]).map(toFixture)
}

/**
 * The club players in each game: the published team sheet's players, else the stored match's club-side appearances (matched by
 * `gameId`). Hidden players are removed. A game with neither has no nominees, hence no ballots.
 */
export async function nomineesByFixture(payload: Payload, fixtures: readonly VoteFixtureRow[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>()
  if (!fixtures.length) return out
  const ids = fixtures.map((f) => f.id)
  const sheets = await payload.find({
    collection: 'team-sheets',
    where: { and: [{ fixture: { in: ids } }, { publishedAt: { exists: true } }] } as Where,
    limit: ids.length,
    pagination: false,
    depth: 0,
    showHiddenFields: true,
    overrideAccess: true,
  })
  const fromSheet = new Map<number, number[]>()
  for (const s of sheets.docs as unknown as { fixture: unknown; publishedSnapshot?: unknown }[]) {
    const fid = idOf(s.fixture)
    const snap = parseSnapshot(s.publishedSnapshot)
    if (fid != null && snap) fromSheet.set(fid, snap.slots.map((x) => x.playerId).filter((p): p is number => typeof p === 'number'))
  }
  const needMatch = fixtures.filter((f) => !(fromSheet.get(f.id)?.length))
  const fromMatch = new Map<number, number[]>()
  if (needMatch.length) {
    const matches = await payload.find({ collection: 'matches', where: { gameId: { in: needMatch.map((f) => f.gameId) } } as Where, limit: needMatch.length, pagination: false, depth: 0, select: { gameId: true }, overrideAccess: true })
    const matchToFixture = new Map<number, number>()
    for (const m of matches.docs as unknown as { id: number; gameId: string }[]) {
      const f = needMatch.find((x) => x.gameId === m.gameId)
      if (f) matchToFixture.set(m.id, f.id)
    }
    if (matchToFixture.size) {
      const apps = await payload.find({
        collection: 'match-appearances',
        where: { and: [{ match: { in: [...matchToFixture.keys()] } }, { isClubSide: { equals: true } }, { player: { exists: true } }] } as Where,
        limit: 5000,
        pagination: false,
        depth: 0,
        select: { match: true, player: true },
        overrideAccess: true,
      })
      for (const a of apps.docs as unknown as { match: unknown; player: unknown }[]) {
        const fid = matchToFixture.get(idOf(a.match) ?? -1)
        const pid = idOf(a.player)
        if (fid != null && pid != null) fromMatch.set(fid, [...(fromMatch.get(fid) ?? []), pid])
      }
    }
  }
  const all = new Set<number>()
  for (const v of [...fromSheet.values(), ...fromMatch.values()]) for (const p of v) all.add(p)
  const players = await loadPlayers(payload, [...all])
  const hiddenIds = new Set([...players.values()].filter((p) => p.hidden).map((p) => p.id))
  // A player id with no row (deleted) is also not a nominee.
  for (const id of all) if (!players.has(id)) hiddenIds.add(id)
  for (const f of fixtures) out.set(f.id, nomineesFor({ sheetPlayerIds: fromSheet.get(f.id), appearancePlayerIds: fromMatch.get(f.id), hiddenIds }))
  return out
}

export const playerInfo = (p: PlayerLite): PlayerInfo => ({ name: p.name, sortName: `${p.lastName} ${p.firstName}`.trim().toLowerCase() })

type RawBallot = { fixture: unknown; picks?: { place?: number | null; player?: unknown }[] | null }

/** Ballots as places only (no voter field is selected, so no (voter, picks) pair is ever in memory here). */
async function placesOnly(payload: Payload, fixtureIds: readonly number[]): Promise<TallyBallot[]> {
  if (!fixtureIds.length) return []
  const res = await payload.find({
    collection: 'best-player-ballots',
    where: { fixture: { in: [...fixtureIds] } } as Where,
    select: { fixture: true, picks: true },
    limit: 20000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const out: TallyBallot[] = []
  for (const b of res.docs as unknown as RawBallot[]) {
    const fixtureId = idOf(b.fixture)
    if (fixtureId == null) continue
    const picks = (b.picks ?? []).flatMap((p) => {
      const playerId = idOf(p.player)
      return typeof p.place === 'number' && playerId != null ? [{ place: p.place, playerId }] : []
    })
    out.push({ fixtureId, picks })
  }
  return out
}

export type BoardScope = { season: number; gradeId: string | null }
export type BoardData = {
  scope: BoardScope
  gradeName: string | null
  settings: VoteSettings
  result: TallyResult
  fixtureCount: number
  grades: { gradeId: string; gradeName: string }[]
  /** Round (weekend) key to a printable date. */
  roundLabels: Record<string, string>
}

export function roundLabel(key: string, locale: string): string {
  const d = new Date(`${key}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return key
  return `Weekend of ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)}`
}

/**
 * The season's totals for one scope. `audience: 'public'` applies the public rules inside the tally (closed rounds only, minimum
 * ballots) and drops hidden players; `'private'` (selector area) also counts games whose window is still open.
 */
export async function computeBoard(payload: Payload, o: { season?: number | null; gradeId?: string | null; audience: 'public' | 'private'; locale: string; now?: Date; settings?: VoteSettings }): Promise<BoardData> {
  const now = o.now ?? new Date()
  const settings = o.settings ?? (await getVoteSettings(payload))
  const season = o.season ?? currentSeasonStartYear(now)
  const all = await finalFixturesInSeason(payload, season)
  const grades = [...new Map(all.map((f) => [f.gradeId, f.gradeName])).entries()].map(([gradeId, gradeName]) => ({ gradeId, gradeName })).sort((a, b) => a.gradeName.localeCompare(b.gradeName))
  const gradeId = o.gradeId && grades.some((g) => g.gradeId === o.gradeId) ? o.gradeId : null
  const fixtures = gradeId ? all.filter((f) => f.gradeId === gradeId) : all
  const [nominees, ballots] = await Promise.all([nomineesByFixture(payload, fixtures), placesOnly(payload, fixtures.map((f) => f.id))])
  const ids = new Set<number>()
  for (const b of ballots) for (const p of b.picks) ids.add(p.playerId)
  for (const v of nominees.values()) for (const p of v) ids.add(p)
  const people = await loadPlayers(payload, [...ids])
  // A hidden (or deleted) player is never named and never gets points.
  const visible = new Map<number, PlayerInfo>()
  for (const p of people.values()) if (!p.hidden) visible.set(p.id, playerInfo(p))
  const clean: TallyBallot[] = ballots.map((b) => ({ fixtureId: b.fixtureId, picks: b.picks.filter((p) => visible.has(p.playerId)) }))
  const tallyFixtures: TallyFixture[] = fixtures.map((f) => ({
    id: f.id,
    round: weekendKey(f.localDate),
    gradeId: f.gradeId,
    counting: isCounting(f),
    closed: voteStatus(f, settings, now) === 'closed',
    nominees: (nominees.get(f.id) ?? []).filter((p) => visible.has(p)),
  }))
  const result = tally({ fixtures: tallyFixtures, ballots: clean, values: settings.ballotValues, minBallots: settings.minBallotsToCount, tieBreakFewestGames: settings.tieBreakFewestGames, audience: o.audience, players: visible })
  return { scope: { season, gradeId }, gradeName: gradeId ? (grades.find((g) => g.gradeId === gradeId)?.gradeName ?? null) : null, settings, result, fixtureCount: fixtures.length, grades, roundLabels: Object.fromEntries(result.rounds.map((r) => [r, roundLabel(r, o.locale)])) }
}

/** Seasons that have at least one final game, newest first (for a season picker). */
export async function seasonsWithGames(payload: Payload, now: Date = new Date()): Promise<number[]> {
  const res = await payload.find({ collection: 'selection-fixtures', where: { status: { equals: 'final' } }, select: { localDate: true }, limit: 5000, pagination: false, depth: 0, overrideAccess: true })
  const set = new Set<number>([currentSeasonStartYear(now)])
  for (const f of res.docs as unknown as { localDate: string }[]) set.add(seasonStartYearOfDate(f.localDate))
  return [...set].sort((a, b) => b - a)
}

/**
 * The public leaderboard. Returns null (a plain 404) unless votes are on, the public switch is on and the scope is allowed; the
 * board then holds closed rounds only, applies the minimum and hides hidden players. Cumulative totals only.
 */
export async function getPublicBoard(payload: Payload, o: { season?: number | null; gradeId?: string | null; locale: string; now?: Date }): Promise<(BoardData & { seasons: number[] }) | null> {
  const settings = await getVoteSettings(payload)
  if (!settings.enabled || !settings.publicLeaderboard) return null
  const wantsGrade = Boolean(o.gradeId)
  if (wantsGrade ? settings.publicScope === 'club' : settings.publicScope === 'grade') return null
  const board = await computeBoard(payload, { ...o, audience: 'public', settings })
  if (wantsGrade && !board.scope.gradeId) return null
  return { ...board, seasons: await seasonsWithGames(payload, o.now) }
}

/** Is the public leaderboard on? (Sitemap and navigation.) */
export async function publicLeaderboardOn(payload: Payload): Promise<boolean> {
  const s = await getVoteSettings(payload)
  return s.enabled && s.publicLeaderboard
}

// ---------------------------------------------------------------------------------------------------------------------------
// The player's own flow (reached through the availability link; the caller proved the player with the signed cookie).
// ---------------------------------------------------------------------------------------------------------------------------

export type OwnBallot = { id: number; picks: BallotPick[]; castAt: string | null; editedAt: string | null; revision: number }

/** The player's OWN ballot for a game, for editing. Nobody else's is ever read through this. */
export async function ownBallot(payload: Payload, fixtureId: number, playerId: number): Promise<OwnBallot | null> {
  const res = await payload.find({ collection: 'best-player-ballots', where: { and: [{ fixture: { equals: fixtureId } }, { voterKey: { equals: `player:${playerId}` } }] } as Where, limit: 1, depth: 0, overrideAccess: true })
  const b = res.docs[0] as unknown as { id: number; picks?: { place?: number; player?: unknown }[]; castAt?: string | null; editedAt?: string | null; revision?: number | null } | undefined
  if (!b) return null
  const picks = (b.picks ?? []).flatMap((p) => (typeof p.place === 'number' && idOf(p.player) != null ? [{ place: p.place, playerId: idOf(p.player)! }] : []))
  return { id: b.id, picks, castAt: b.castAt ?? null, editedAt: b.editedAt ?? null, revision: Number(b.revision ?? 1) }
}

export type VotableGame = { id: number; gradeName: string; roundName: string | null; opponentName: string; localDate: string; voted: boolean; closesOn: string }

/** The games an identified player can vote on right now: finished, counting, window open, and they were in the team. */
export async function votableGames(payload: Payload, playerId: number, settings: VoteSettings, now: Date = new Date()): Promise<VotableGame[]> {
  if (!settings.enabled) return []
  const cutoff = addDays(clubToday(now), -(settings.voteWindowDays + 1))
  const res = await payload.find({
    collection: 'selection-fixtures',
    where: { and: [{ status: { equals: 'final' } }, { votesState: { not_equals: 'closed' } }, { or: [{ localDate: { greater_than_equal: cutoff } }, { votesState: { equals: 'open' } }] }] } as Where,
    limit: 200,
    pagination: false,
    depth: 0,
    sort: ['-localDate', 'id'],
    overrideAccess: true,
  })
  const open = (res.docs as unknown as RawFixture[]).map(toFixture).filter((f) => f.countsForAwards && voteStatus(f, settings, now) === 'open')
  if (!open.length) return []
  const nominees = await nomineesByFixture(payload, open)
  const mine = open.filter((f) => nominees.get(f.id)?.includes(playerId))
  if (!mine.length) return []
  const voted = await payload.find({ collection: 'best-player-ballots', where: { and: [{ fixture: { in: mine.map((f) => f.id) } }, { voterKey: { equals: `player:${playerId}` } }] } as Where, select: { fixture: true }, limit: mine.length, pagination: false, depth: 0, overrideAccess: true })
  const votedIds = new Set((voted.docs as unknown as { fixture: unknown }[]).map((b) => idOf(b.fixture)))
  return mine.map((f) => ({ id: f.id, gradeName: f.gradeName, roundName: f.roundName, opponentName: f.opponentName, localDate: f.localDate, voted: votedIds.has(f.id), closesOn: addDays(f.localDate, settings.voteWindowDays) }))
}

export type VoteView = {
  fixture: { id: number; gradeName: string; roundName: string | null; opponentName: string; localDate: string }
  player: { id: number; name: string }
  values: number[]
  /** The people this voter may choose from. */
  options: { id: number; name: string }[]
  places: number
  existing: BallotPick[]
  hasBallot: boolean
  /** The ballot can still be changed (the vote form is shown); false means read-only "Your vote is in". */
  canEdit: boolean
}

/**
 * The vote page's data. Identity first (the link, then the cookie), THEN the fixture. Every failure returns the same `null`, which the
 * page turns into one plain not-found: a wrong link, no cookie, votes off, an unknown game, a game this player was not in and a closed
 * game cannot be told apart, and an unidentified request never learns which games exist (its lookup is for a dummy id).
 */
export async function loadVoteView(payload: Payload, i: { token: string; cookie: string | undefined; fixtureId: string; now?: Date }): Promise<VoteView | null> {
  const now = i.now ?? new Date()
  const link = await resolveLink(payload, i.token)
  const player = link ? await rememberedPlayer(payload, i.cookie, link) : null
  const settings = await getVoteSettings(payload)
  const identified = Boolean(link && player && settings.enabled)
  const wanted = identified && /^\d{1,9}$/.test(i.fixtureId) ? Number(i.fixtureId) : -1
  const fixture = await findVoteFixture(payload, wanted)
  const nominees = fixture && identified ? await nomineesByFixture(payload, [fixture]) : new Map<number, number[]>()
  const mine = fixture && player ? (nominees.get(fixture.id) ?? []) : []
  if (!identified || !fixture || !player || !fixture.countsForAwards || voteStatus(fixture, settings, now) !== 'open' || !mine.includes(player.id)) return null
  const pickable = pickableFor(mine, player.id, settings.allowSelfVote)
  const people = await loadPlayers(payload, pickable)
  const options = [...people.values()].filter((p) => !p.hidden).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: p.id, name: p.name }))
  const existing = await ownBallot(payload, fixture.id, player.id)
  const canEdit = existing ? editWindowOpen(fixture, existing.castAt, settings, now) : true
  return {
    fixture: { id: fixture.id, gradeName: fixture.gradeName, roundName: fixture.roundName, opponentName: fixture.opponentName, localDate: fixture.localDate },
    player: { id: player.id, name: player.name },
    values: settings.ballotValues,
    options,
    places: placesRequired(settings.ballotValues.length, options.length),
    existing: existing?.picks ?? [],
    hasBallot: Boolean(existing),
    canEdit,
  }
}

export type CastResult = { ok: true } | { ok: false; message: string; code: 'locked' | 'invalid' | 'closed' | 'unavailable'; reason?: BallotError }
const UNAVAILABLE: CastResult = { ok: false, code: 'unavailable', message: 'This vote is not available any more.' }

const HOUR = 3_600_000
const rule = (limit: number): ThrottleRule => ({ limit, windowMs: HOUR, lockMs: 15 * 60_000 })

/** Counts a cast on the player, link and address keys. False means a key is locked (the caller shows the availability lock message). */
export async function voteThrottleAllows(payload: Payload, o: { playerId: number; linkVersion: number; ip: string | null }): Promise<boolean> {
  const results = [
    await hit(payload, `votes:player:${o.playerId}`, rule(VOTES.perPlayerPerHour)),
    await hit(payload, `votes:link:${o.linkVersion}`, rule(VOTES.perLinkPerHour)),
    ...(o.ip ? [await hit(payload, `votes:ip:${o.ip}`, rule(VOTES.perIpPerHour))] : []),
  ]
  return results.every((r) => r.allowed)
}

/** Writes (or replaces) one ballot. The unique `(fixture, voterKey)` index settles a race: the loser updates the winner's row. */
export async function writeBallot(payload: Payload, o: { fixtureId: number; voterKey: string; voterPlayerId: number | null; picks: readonly BallotPick[]; source: 'voter' | 'selector'; castBy: number | null; now?: Date }): Promise<{ created: boolean }> {
  const stamp = (o.now ?? new Date()).toISOString()
  const picks = o.picks.map((p) => ({ place: p.place, player: p.playerId }))
  const where: Where = { and: [{ fixture: { equals: o.fixtureId } }, { voterKey: { equals: o.voterKey } }] }
  const update = async (id: number, revision: number) => {
    await payload.update({ collection: 'best-player-ballots', id, data: { picks, editedAt: stamp, revision: revision + 1 } as never, overrideAccess: true, context: CTX })
  }
  const existing = (await payload.find({ collection: 'best-player-ballots', where, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { id: number; revision?: number | null } | undefined
  if (existing) {
    await update(existing.id, Number(existing.revision ?? 1))
    return { created: false }
  }
  try {
    await payload.create({ collection: 'best-player-ballots', data: { fixture: o.fixtureId, voterKey: o.voterKey, voter: o.voterPlayerId, picks, source: o.source, castBy: o.castBy, castAt: stamp, revision: 1 } as never, overrideAccess: true, context: CTX })
    return { created: true }
  } catch (err) {
    const again = (await payload.find({ collection: 'best-player-ballots', where, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { id: number; revision?: number | null } | undefined
    if (!again) throw err
    await update(again.id, Number(again.revision ?? 1))
    return { created: false }
  }
}

/**
 * A player casts or changes their ballot. `cookie` and `token` come from the request; the player is whoever the signed cookie says,
 * never anything in the form. Same refusal for every ineligible case.
 */
export async function castBallotFor(payload: Payload, i: { token: string; cookie: string | undefined; fixtureId: unknown; readPicks: (valuesCount: number) => readonly BallotPick[] | null; ip: string | null; now?: Date }): Promise<CastResult> {
  const now = i.now ?? new Date()
  const link = await resolveLink(payload, i.token)
  const player = link ? await rememberedPlayer(payload, i.cookie, link) : null
  if (!link || !player) return UNAVAILABLE
  if (!(await voteThrottleAllows(payload, { playerId: player.id, linkVersion: link.linkVersion, ip: i.ip }))) return { ok: false, code: 'locked', message: LOCKED_MESSAGE }
  const settings = await getVoteSettings(payload)
  const id = typeof i.fixtureId === 'number' ? i.fixtureId : typeof i.fixtureId === 'string' && /^\d{1,9}$/.test(i.fixtureId) ? Number(i.fixtureId) : -1
  const fixture = await findVoteFixture(payload, settings.enabled ? id : -1)
  if (!settings.enabled || !fixture || !fixture.countsForAwards || voteStatus(fixture, settings, now) !== 'open') return UNAVAILABLE
  const nominees = (await nomineesByFixture(payload, [fixture])).get(fixture.id) ?? []
  if (!nominees.includes(player.id)) return UNAVAILABLE
  const existing = await ownBallot(payload, fixture.id, player.id)
  if (existing && !editWindowOpen(fixture, existing.castAt, settings, now)) return { ok: false, code: 'closed', message: 'Your vote is in and can no longer be changed.' }
  const picks = i.readPicks(settings.ballotValues.length)
  if (!picks) return { ok: false, code: 'invalid', reason: 'bad_input', message: BALLOT_MESSAGES.bad_input }
  const checked = validateBallot(picks, nominees, settings.ballotValues.length, player.id, settings.allowSelfVote)
  if (!checked.ok) return { ok: false, code: 'invalid', reason: checked.code, message: checked.message }
  await writeBallot(payload, { fixtureId: fixture.id, voterKey: `player:${player.id}`, voterPlayerId: player.id, picks: checked.picks, source: 'voter', castBy: null, now })
  return { ok: true }
}
