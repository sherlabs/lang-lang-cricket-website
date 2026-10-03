import 'server-only'
import { unstable_cache } from 'next/cache'
import { getPayloadClient } from '@/lib/payload/client'
import { isActive, playerName } from '@/lib/players/view'
import type { HonourPlayer } from './honours'
import type { MilestonePlayer } from './milestones'
import type { SeasonCounts } from '@/lib/players/season-math'
import type { StatRow } from './aggregate'
import { seasonIndex, type SeasonInfo } from './season-window'

/**
 * The only Payload access for stats (spec 3.1). The Local API runs with `overrideAccess`, so
 * every public query states its own hidden-player filter. Cached values are slim and per
 * season (`['stat-rows', season]`) to stay far below the 2MB `unstable_cache` entry cap.
 */
export const STATS_TAG = 'player-stats'
const REVALIDATE_SECONDS = 3600

export type PlayerLite = { id: number; name: string; slug: string }
export type StatData = { rows: StatRow[]; seasons: SeasonInfo[]; players: Map<number, PlayerLite> }

const COUNT_KEYS = [
  'games', 'batInnings', 'batNotOuts', 'batRuns', 'batHighScore', 'batBalls', 'batFours', 'batSixes',
  'bowlBalls', 'bowlMaidens', 'bowlRuns', 'bowlWickets', 'bowlBestWickets', 'bowlBestRuns', 'catches',
] as const satisfies readonly (keyof SeasonCounts)[]

/** Columnar per-season payload: `rows[i] = [playerId, seasonOrder, teamIdx, gradeIdx, ...COUNT_KEYS, notOut]`. */
type SlimSeason = { seasonName: string; teams: string[]; grades: string[]; rows: number[][] }

/**
 * `unstable_cache` needs a Next incremental cache; outside a Next request (vitest, `payload run`
 * scripts) it throws that exact invariant, and the loader is simply run uncached.
 */
export async function cached<T>(keyParts: string[], loader: () => Promise<T>): Promise<T> {
  try {
    return await unstable_cache(loader, keyParts, { tags: [STATS_TAG], revalidate: REVALIDATE_SECONDS })()
  } catch (err) {
    if (err instanceof Error && /incrementalCache missing/.test(err.message)) return loader()
    throw err
  }
}

type SeasonDoc = {
  player: number | { id: number }
  seasonName: string; seasonOrder: number; teamId: string; teamName: string; gradeName?: string | null; batHighScoreNotOut?: boolean | null
} & Record<(typeof COUNT_KEYS)[number], number>

const SELECT = {
  player: true, seasonName: true, seasonOrder: true, teamId: true, teamName: true, gradeName: true, batHighScoreNotOut: true,
  ...Object.fromEntries(COUNT_KEYS.map((k) => [k, true])),
} as const

const pid = (p: SeasonDoc['player']) => (typeof p === 'number' ? p : p.id)

function slim(seasonName: string, docs: SeasonDoc[]): SlimSeason {
  const teams: string[] = [], grades: string[] = []
  const idx = (list: string[], v: string) => { const i = list.indexOf(v); if (i >= 0) return i; list.push(v); return list.length - 1 }
  const rows = docs.map((d) => [
    pid(d.player), d.seasonOrder, idx(teams, d.teamName), d.gradeName ? idx(grades, d.gradeName) : -1,
    ...COUNT_KEYS.map((k) => Number(d[k] ?? 0)), d.batHighScoreNotOut ? 1 : 0,
  ])
  return { seasonName, teams, grades, rows }
}

function expand(s: SlimSeason): StatRow[] {
  return s.rows.map((r, i) => {
    const counts = { batHighScoreNotOut: r[4 + COUNT_KEYS.length] === 1 } as SeasonCounts
    COUNT_KEYS.forEach((k, j) => { counts[k] = r[4 + j] })
    return {
      playerId: r[0], seasonName: s.seasonName, seasonOrder: r[1], teamId: `${s.seasonName}#${i}`,
      teamName: s.teams[r[2]], gradeName: r[3] >= 0 ? s.grades[r[3]] : null, counts,
    }
  })
}

const VISIBLE = { 'player.hidden': { equals: false } } as const

async function loadSeason(seasonName: string): Promise<SlimSeason> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'player-seasons',
    where: { and: [{ seasonName: { equals: seasonName } }, VISIBLE] },
    pagination: false, depth: 0, sort: 'id', select: SELECT,
  })
  return slim(seasonName, docs as unknown as SeasonDoc[])
}

async function loadIndex(): Promise<SeasonInfo[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'player-seasons', where: VISIBLE, pagination: false, depth: 0, sort: 'id',
    select: { seasonName: true, seasonOrder: true },
  })
  return seasonIndex(docs)
}

async function loadPlayers(hiddenToo: boolean): Promise<PlayerLite[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'players', ...(hiddenToo ? {} : { where: { hidden: { equals: false } } }),
    pagination: false, depth: 0, joins: false, sort: 'id',
    select: { firstName: true, lastName: true, slug: true },
  })
  return docs.map((d) => ({ id: d.id, name: playerName({ firstName: d.firstName ?? '', lastName: d.lastName ?? '' }), slug: d.slug ?? '' }))
}

/**
 * Rows of every non-hidden player, in a cached slim shape. Public pages, the CSV export and
 * the share card all read this one function, so a hidden player cannot appear anywhere.
 */
export async function getVisibleStatData(): Promise<StatData> {
  const [seasons, players] = await Promise.all([
    cached(['stat-season-index'], loadIndex),
    cached(['stat-players'], () => loadPlayers(false)),
  ])
  const perSeason = await Promise.all(seasons.map((s) => cached(['stat-rows', s.seasonName], () => loadSeason(s.seasonName))))
  const lookup = new Map(players.map((p) => [p.id, p]))
  // Defensive join: a stats row whose player is not in the visible list is dropped.
  const rows = perSeason.flatMap(expand).filter((r) => lookup.has(r.playerId))
  return { rows, seasons, players: lookup }
}

/**
 * Admin-only twin: uncached and with no hidden filter. Only `payload/components` may import
 * this; it must never feed a public page.
 */
export async function getAllStatRowsForAdmin(): Promise<StatData> {
  const payload = await getPayloadClient()
  const [{ docs }, players] = await Promise.all([
    payload.find({ collection: 'player-seasons', pagination: false, depth: 0, sort: 'id', select: SELECT }),
    loadPlayers(true),
  ])
  const byName = new Map<string, SeasonDoc[]>()
  for (const d of docs as unknown as SeasonDoc[]) byName.set(d.seasonName, [...(byName.get(d.seasonName) ?? []), d])
  const rows = [...byName].flatMap(([name, list]) => expand(slim(name, list)))
  return { rows, seasons: seasonIndex(rows), players: new Map(players.map((p) => [p.id, p])) }
}

/** The latest finished sync run, for "as of" lines. Null when no run has finished. */
export async function getLastSyncAt(): Promise<Date | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'player-sync-runs', where: { status: { equals: 'ok' } }, sort: '-finishedAt', limit: 1, depth: 0,
  })
  const at = (docs[0] as { finishedAt?: string | null } | undefined)?.finishedAt
  return at ? new Date(at) : null
}


type PlayerDocLite = {
  id: number; firstName?: string | null; lastName?: string | null; slug?: string | null
  activeOverride?: 'active' | 'past' | null; isActiveDerived?: boolean | null; manualYears?: string | null
  baselineGames?: number | null; baselineRuns?: number | null; baselineWickets?: number | null; baselineCatches?: number | null
  honours?: { years?: string | null; title?: string | null }[] | null
}

const PLAYER_SELECT = {
  firstName: true, lastName: true, slug: true, activeOverride: true, isActiveDerived: true, manualYears: true,
  baselineGames: true, baselineRuns: true, baselineWickets: true, baselineCatches: true,
} as const

const toMilestonePlayer = (d: PlayerDocLite): MilestonePlayer => ({
  id: d.id,
  name: playerName({ firstName: d.firstName ?? '', lastName: d.lastName ?? '' }),
  slug: d.slug ?? '',
  active: isActive({ activeOverride: d.activeOverride ?? null, isActiveDerived: Boolean(d.isActiveDerived) }),
  manualYears: d.manualYears ?? '',
  baseline: { games: Number(d.baselineGames ?? 0), runs: Number(d.baselineRuns ?? 0), wickets: Number(d.baselineWickets ?? 0), catches: Number(d.baselineCatches ?? 0) },
})

async function loadMilestonePlayers(hiddenToo: boolean): Promise<MilestonePlayer[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'players', ...(hiddenToo ? {} : { where: { hidden: { equals: false } } }),
    pagination: false, depth: 0, joins: false, sort: 'id', select: PLAYER_SELECT,
  })
  return (docs as unknown as PlayerDocLite[]).map(toMilestonePlayer)
}

/** Visible players with the fields milestones need (active flag, manual years, baseline), cached under the stats tag. */
export const getMilestonePlayers = (): Promise<MilestonePlayer[]> => cached(['stat-milestone-players'], () => loadMilestonePlayers(false))

/** Admin-only twin: uncached, hidden players included. Only `payload/components` may import it. */
export const getAllMilestonePlayersForAdmin = (): Promise<MilestonePlayer[]> => loadMilestonePlayers(true)

/** Visible players that hold at least one honour, for the honour board. */
export async function getHonourPlayers(): Promise<HonourPlayer[]> {
  return cached(['stat-honour-players'], async () => {
    const payload = await getPayloadClient()
    const { docs } = await payload.find({
      collection: 'players', where: { hidden: { equals: false } },
      pagination: false, depth: 0, joins: false, sort: 'id', select: { firstName: true, lastName: true, slug: true, honours: true },
    })
    return (docs as unknown as PlayerDocLite[])
      .map((d) => ({
        id: d.id,
        name: playerName({ firstName: d.firstName ?? '', lastName: d.lastName ?? '' }),
        slug: d.slug ?? '',
        honours: (d.honours ?? []).map((h) => ({ years: h.years ?? '', title: h.title ?? '' })),
      }))
      .filter((p) => p.honours.length > 0)
  })
}
