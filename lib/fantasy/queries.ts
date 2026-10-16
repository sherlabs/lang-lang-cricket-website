import 'server-only'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import type { Payload, Where } from 'payload'
import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'
import { getPayloadClient } from '@/lib/payload/client'
import { getSeasonFacts, NO_YEAR_SEASON } from '@/lib/match-store/stats-queries'
import { mergeFactSets } from '@/lib/stats/match/facts'
import { ALL_STATS_TAGS } from '@/lib/stats/tags'
import { isStaffUser } from '@/payload/access'
import { fantasyCookieName } from './link'
import { rememberedEntry } from './join'
import { buildLeaderboard, squadFor, type LbRound, type LbRow } from './leaderboard'
import { buildRounds, currentRound, type RoundView } from './rounds'
import { roundPoints } from './score'
import { squadsAround } from './squads'
import { outOfGame } from './squad'
import {
  FANTASY_TAG, getPlayableCompetition, listEntries, loadPool, loadRoundInputs, lockedSquads, squadsOfEntry,
  type EntryPublic, type FantasySeason, type FantasySettings, type PoolPlayer, type RoundInputs,
} from './store'
import { weekendKey } from '../selection/weekend'
import type { FantasyRules, ScoringTable } from './rules'

/**
 * The data layer the public fantasy pages use (wave F spec 4.6). Every query states its own filter and checks the visibility
 * rules itself: the competition must be on with an open season; a squad is read only for a round that has locked; PIN data and the
 * join token are never read here. Points are computed from the cached public facts layer, so hidden players are already gone, and
 * juniors are dropped by the `isJunior` flag.
 */
const REVALIDATE_SECONDS = 300

async function fantasyCached<T>(keyParts: string[], loader: () => Promise<T>): Promise<T> {
  try {
    return await unstable_cache(loader, keyParts, { tags: [FANTASY_TAG, ...ALL_STATS_TAGS], revalidate: REVALIDATE_SECONDS })()
  } catch (err) {
    if (err instanceof Error && /incrementalCache missing/.test(err.message)) return loader()
    throw err
  }
}

type SeasonRoundData = { inputs: RoundInputs; points: Record<string, [number, number][]> }

async function loadSeasonRoundData(seasonId: number, seasonStartYear: number, scoring: ScoringTable): Promise<SeasonRoundData> {
  const payload = await getPayloadClient()
  const inputs = await loadRoundInputs(payload, { id: seasonId, seasonStartYear })
  // Stored games whose season name has no year sit in a separate blob; they score when their date falls in a round of this season.
  const set = mergeFactSets([await getSeasonFacts(seasonStartYear), await getSeasonFacts(NO_YEAR_SEASON)])
  const juniors = await payload.find({ collection: 'players', where: { isJunior: { equals: true } }, limit: 5000, pagination: false, depth: 0, joins: false, overrideAccess: true, select: { slug: true } })
  const junior = new Set(juniors.docs.map((p) => p.id))
  // Players the committee took out of the game (this season's price rows) score nothing in any round, past ones included.
  const out = await payload.find({ collection: 'fantasy-prices', where: { and: [{ season: { equals: seasonId } }, { available: { equals: false } }] } as Where, limit: 5000, pagination: false, depth: 0, overrideAccess: true, select: { player: true } })
  const takenOut = new Set(out.docs.map((d) => (typeof d.player === 'object' && d.player ? (d.player as { id: number }).id : d.player) as number))
  const eligible = new Set(set.appearances.map((a) => a.player).filter((p) => !junior.has(p) && !takenOut.has(p)))
  const keys = new Set(inputs.fixtures.filter((f) => f.status !== 'removed').map((f) => weekendKey(f.localDate)))
  const points: Record<string, [number, number][]> = {}
  for (const key of keys) points[key] = [...roundPoints(set, key, scoring, eligible)].map(([p, v]) => [p, v.points])
  return { inputs, points }
}

export type RoundSummary = { key: string; label: string; status: RoundView['status']; provisional: boolean; closedByCommittee: boolean; locksAt: string }

const labelFormat = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, day: 'numeric', month: 'short' })
export const roundLabel = (key: string): string => `Weekend of ${labelFormat.format(new Date(`${key}T12:00:00Z`))}`

const summarise = (r: RoundView): RoundSummary => ({ key: r.key, label: roundLabel(r.key), status: r.status, provisional: r.provisional, closedByCommittee: r.closedByCommittee, locksAt: r.locksAt.toISOString() })

/** Live round inputs, read once per request (the page, its metadata and the team view all ask). */
const freshRoundInputs = cache(async (id: number, seasonStartYear: number): Promise<RoundInputs> => loadRoundInputs(await getPayloadClient(), { id, seasonStartYear }))

export async function getSeasonRounds(payload: Payload, season: FantasySeason, now: Date = new Date()): Promise<{ rounds: RoundView[]; summaries: RoundSummary[]; points: Map<string, Map<number, number>>; reasons: Map<string, string> }> {
  const data = await fantasyCached(['fantasy-round-data', 'v2', String(season.id), JSON.stringify(season.rules.scoring)], () => loadSeasonRoundData(season.id, season.seasonStartYear, season.rules.scoring))
  // Round state is read fresh (a committee change must show at once); only the points come from the cache.
  const fresh = await freshRoundInputs(season.id, season.seasonStartYear)
  const rounds = buildRounds(fresh.fixtures, fresh.states, new Set(fresh.storedGameIds), now)
  const points = new Map(Object.entries(data.points).map(([k, v]) => [k, new Map(v)]))
  const reasons = new Map(fresh.states.filter((s) => s.scoredManually && s.scoredReason).map((s) => [s.weekendKey, s.scoredReason as string]))
  return { rounds, summaries: rounds.map(summarise), points, reasons }
}

// ---- Who is looking ----

export type Viewer = { entry: EntryPublic | null; staff: boolean }

export async function getViewer(payload: Payload, season: FantasySeason, linkVersion: number): Promise<Viewer> {
  const raw = (await cookies()).get(fantasyCookieName())?.value
  const remembered = raw ? await rememberedEntry(payload, raw, season, linkVersion) : null
  const { user } = await payload.auth({ headers: await headers() })
  return { entry: remembered?.entry ?? null, staff: isStaffUser(user) }
}

export const canSeeLeaderboard = (settings: Pick<FantasySettings, 'publicLeaderboard'>, v: Viewer): boolean => settings.publicLeaderboard || v.entry !== null || v.staff

// ---- Overview ----

export type Overview = { competitionName: string; season: { name: string; rules: FantasyRules }; round: RoundSummary | null; leaderboardOpen: boolean; managers: number }

/** What `/fantasy` shows. Null (a plain 404) while the competition is off or no season is open. */
type OverviewResult = { overview: Overview; settings: FantasySettings; season: FantasySeason } | null
const overviewOnce = cache((): Promise<OverviewResult> => loadOverview(new Date()))
/** Without an explicit clock the result is shared within one request (`generateMetadata` and the page both call it). */
export const getOverview = (now?: Date): Promise<OverviewResult> => (now ? loadOverview(now) : overviewOnce())

async function loadOverview(now: Date): Promise<OverviewResult> {
  const payload = await getPayloadClient()
  const live = await getPlayableCompetition(payload)
  if (!live) return null
  const { rounds } = await getSeasonRounds(payload, live.season, now)
  const open = currentRound(rounds, now)
  const managers = (await payload.count({ collection: 'fantasy-entries', where: { and: [{ season: { equals: live.season.id } }, { disabled: { not_equals: true } }] }, overrideAccess: true })).totalDocs
  return {
    overview: { competitionName: live.settings.competitionName, season: { name: live.season.name, rules: live.season.rules }, round: open ? summarise(open) : null, leaderboardOpen: live.settings.publicLeaderboard, managers },
    settings: live.settings,
    season: live.season,
  }
}

// ---- Leaderboard ----

export type LeaderboardView = {
  competitionName: string
  seasonName: string
  scoringRules: FantasyRules['scoring']
  captainMultiplier: number
  rounds: RoundSummary[]
  selected: RoundSummary | null
  rows: LbRow[]
  mine: number | null
  reasons: Record<string, string>
}

/** The shared leaderboard computation (the page and the admin export both use it). Only rounds that have locked count. */
export async function computeLeaderboard(payload: Payload, season: FantasySeason, o: { round?: string | null; includeDisabled?: boolean; now?: Date } = {}): Promise<{ rows: LbRow[]; rounds: RoundSummary[]; selected: RoundSummary | null; reasons: Map<string, string> }> {
  const now = o.now ?? new Date()
  const { rounds, points, reasons } = await getSeasonRounds(payload, season, now)
  const locked = rounds.filter((r) => r.status !== 'upcoming')
  const selected = o.round ? (locked.find((r) => r.key === o.round) ?? null) : null
  const use = selected ? [selected] : locked
  const entries = await listEntries(payload, season.id, { includeDisabled: o.includeDisabled })
  const lastLocked = locked.length ? locked[locked.length - 1].key : null
  const squads = await lockedSquads(payload, entries.map((e) => e.id), lastLocked)
  const lbRounds: LbRound[] = use.map((r) => ({ key: r.key, points: points.get(r.key) ?? new Map(), provisional: r.provisional }))
  const rows = buildLeaderboard({ entries: entries.map((e) => ({ id: e.id, teamName: e.teamName, joinedAt: e.joinedAt })), squads, rounds: lbRounds, captainMultiplier: season.rules.captainMultiplier })
  return { rows, rounds: locked.map(summarise), selected: selected ? summarise(selected) : null, reasons }
}

export async function getLeaderboardView(settings: FantasySettings, season: FantasySeason, viewer: Viewer, round: string | null, now: Date = new Date()): Promise<LeaderboardView> {
  const payload = await getPayloadClient()
  const r = await computeLeaderboard(payload, season, { round, now })
  return {
    competitionName: settings.competitionName, seasonName: season.name, scoringRules: season.rules.scoring, captainMultiplier: season.rules.captainMultiplier,
    rounds: r.rounds, selected: r.selected, rows: r.rows, mine: viewer.entry ? viewer.entry.id : null, reasons: Object.fromEntries(r.reasons),
  }
}

// ---- The manager's own team ----

export type PickerPlayer = { id: number; name: string; priceTenths: number; role: string | null; games: number | null; perGame: number | null; thin: boolean; inGame: boolean }
export type TeamView = {
  competitionName: string
  seasonName: string
  entry: { id: number; teamName: string; mustChangePin: boolean }
  rules: FantasyRules
  round: RoundSummary | null
  pool: PickerPlayer[]
  picks: number[]
  captain: number | null
  /** The squad of the round before the one being picked, the base for the transfer count. */
  previous: number[]
  savedForRound: boolean
  gone: { id: number; name: string }[]
  history: { round: string; label: string; points: number; provisional: boolean }[]
  total: number
  rank: number | null
  managers: number
}

const picker = (p: PoolPlayer): PickerPlayer => ({
  id: p.id, name: p.name, priceTenths: p.priceTenths, role: p.role, games: p.basis ? p.basis.games : null,
  perGame: p.basis && p.basis.games > 0 ? Math.round((p.basis.points / p.basis.games) * 10) / 10 : null, thin: p.basis ? p.basis.thin : true, inGame: p.inGame,
})

export async function getTeamView(settings: FantasySettings, season: FantasySeason, entry: EntryPublic, now: Date = new Date()): Promise<TeamView> {
  const payload = await getPayloadClient()
  const { rounds, points } = await getSeasonRounds(payload, season, now)
  const open = currentRound(rounds, now)
  const pool = await loadPool(payload, season.id)
  const mine = await squadsOfEntry(payload, entry.id)
  const around = open ? squadsAround(mine, open.key) : { saved: null, previous: null, inForce: mine[mine.length - 1] ?? null }
  const inForce = around.inForce
  const squadPool = new Map([...pool].map(([id, p]) => [id, { priceTenths: p.priceTenths, inGame: p.inGame }]))
  const goneIds = inForce ? outOfGame(inForce.picks, squadPool) : []
  const lbSquads = mine.map((s) => ({ entry: s.entry, round: s.round, picks: s.picks, captain: s.captain }))
  const locked = rounds.filter((r) => r.status !== 'upcoming')
  const history = locked.map((r) => {
    const sq = squadFor(lbSquads, r.key)
    const pts = points.get(r.key) ?? new Map<number, number>()
    let total = 0
    if (sq) for (const p of sq.picks) total += (pts.get(p) ?? 0) * (p === sq.captain ? season.rules.captainMultiplier : 1)
    return { round: r.key, label: roundLabel(r.key), points: total, provisional: r.provisional }
  })
  const lb = await computeLeaderboard(payload, season, { now })
  const managers = lb.rows.length
  const rank = lb.rows.find((r) => r.entry === entry.id)?.rank ?? null
  const wanted = new Map<number, PoolPlayer>()
  for (const p of pool.values()) if (p.inGame) wanted.set(p.id, p)
  for (const id of inForce?.picks ?? []) {
    const p = pool.get(id)
    if (p) wanted.set(id, p)
  }
  return {
    competitionName: settings.competitionName, seasonName: season.name,
    entry: { id: entry.id, teamName: entry.teamName, mustChangePin: entry.mustChangePin },
    rules: season.rules, round: open ? summarise(open) : null,
    pool: [...wanted.values()].sort((a, b) => b.priceTenths - a.priceTenths || a.name.localeCompare(b.name)).map(picker),
    picks: inForce?.picks ?? [], captain: inForce?.captain ?? null, previous: around.previous?.picks ?? [], savedForRound: Boolean(around.saved),
    gone: goneIds.map((id) => ({ id, name: pool.get(id)?.name ?? 'A player' })), history,
    total: history.reduce((s, h) => s + h.points, 0), rank, managers,
  }
}

/**
 * Does the Fantasy entry belong in the stats sub-menu? Only while the competition is on with an open season. Cached for a few
 * minutes under the fantasy tag (like the vote board entry), so the sub-menu does not query on every page.
 */
export const getCachedFantasyOn = (): Promise<boolean> =>
  fantasyCached(['fantasy-menu', 'v1'], async () => {
    const payload = await getPayloadClient()
    return (await getPlayableCompetition(payload)) !== null
  })
