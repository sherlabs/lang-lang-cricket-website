import type { SeasonCounts } from '@/lib/players/season-math'
import { mergeBySeason, type StatRow } from './aggregate'
import { shortSeason } from './season-window'

/**
 * Milestones (spec 3.6). Totals only cover the stored window, so a veteran's "games" is an
 * undercount. Two guards: an optional per-player pre-PlayHQ baseline added to the totals, and,
 * when no baseline is recorded but `manualYears` shows earlier history, the player is left out of
 * "approaching" and achieved milestones are labelled "since <window start>" with no season.
 */
export type MilestoneKey = 'games' | 'runs' | 'wickets' | 'catches'
export const MILESTONE_KEYS: readonly MilestoneKey[] = ['games', 'runs', 'wickets', 'catches']
export const MILESTONE_LABELS: Record<MilestoneKey, string> = { games: 'games', runs: 'runs', wickets: 'wickets', catches: 'catches' }

export type Baseline = Record<MilestoneKey, number>
export const NO_BASELINE: Baseline = { games: 0, runs: 0, wickets: 0, catches: 0 }
export type MilestoneConfig = { thresholds: Record<MilestoneKey, number[]>; window: Record<MilestoneKey, number> }

const COUNT_OF: Record<MilestoneKey, (c: SeasonCounts) => number> = {
  games: (c) => c.games, runs: (c) => c.batRuns, wickets: (c) => c.bowlWickets, catches: (c) => c.catches,
}

export type Achieved = {
  key: MilestoneKey
  threshold: number
  /** Short season ("2024/25") in which the total crossed the threshold; null when it cannot be known. */
  reachedIn: string | null
  /** True when the total only counts the stored window, so the figure reads "since 2023/24". */
  sinceWindow: boolean
}
export type Approaching = { key: MilestoneKey; threshold: number; current: number; remaining: number }
export type PlayerMilestones = { achieved: Achieved[]; approaching: Approaching[]; totals: Record<MilestoneKey, number>; partial: boolean }

const firstYear = (s: string): number | null => {
  const m = /(?:19|20)\d{2}/.exec(s)
  return m ? Number(m[0]) : null
}

/** True when `manualYears` starts before the first stored season (history the database does not hold). */
export function hasEarlierHistory(manualYears: string, earliestSeasonName: string | null): boolean {
  if (!earliestSeasonName) return false
  const start = firstYear(manualYears), window = firstYear(earliestSeasonName)
  return start !== null && window !== null && start < window
}

export type MilestoneSeason = { seasonName: string; seasonOrder: number; counts: SeasonCounts }

export function milestonesFor(o: {
  seasons: readonly MilestoneSeason[]
  baseline?: Baseline
  manualYears?: string
  /** Earliest season stored for the whole club (the window start), not just this player. */
  windowStart: string | null
  config: MilestoneConfig
}): PlayerMilestones {
  const baseline = o.baseline ?? NO_BASELINE
  const earlier = hasEarlierHistory(o.manualYears ?? '', o.windowStart)
  let partial = false
  const oldestFirst = [...o.seasons].sort((a, b) => b.seasonOrder - a.seasonOrder)
  const achieved: Achieved[] = []
  const approaching: Approaching[] = []
  const totals = { ...NO_BASELINE }
  for (const key of MILESTONE_KEYS) {
    // Partial per key: no recorded baseline for this key while earlier history exists.
    const keyPartial = earlier && baseline[key] === 0
    if (keyPartial) partial = true
    const stored = oldestFirst.reduce((n, s) => n + COUNT_OF[key](s.counts), 0)
    const total = stored + baseline[key]
    totals[key] = total
    const thresholds = [...o.config.thresholds[key]].sort((a, b) => a - b)
    for (const t of thresholds) {
      if (total < t) break
      let reachedIn: string | null = null
      if (!keyPartial && baseline[key] < t) {
        let cum = baseline[key]
        for (const s of oldestFirst) {
          cum += COUNT_OF[key](s.counts)
          if (cum >= t) { reachedIn = shortSeason(s.seasonName); break }
        }
      }
      achieved.push({ key, threshold: t, reachedIn, sinceWindow: keyPartial })
    }
    if (keyPartial) continue
    const next = thresholds.find((t) => t > total)
    if (next !== undefined && next - total <= o.config.window[key]) approaching.push({ key, threshold: next, current: total, remaining: next - total })
  }
  return { achieved, approaching, totals, partial }
}

/** The highest achieved threshold per key (the badge a profile shows). */
export function topAchieved(achieved: readonly Achieved[]): Achieved[] {
  const best = new Map<MilestoneKey, Achieved>()
  for (const a of achieved) {
    const prev = best.get(a.key)
    if (!prev || a.threshold > prev.threshold) best.set(a.key, a)
  }
  return MILESTONE_KEYS.flatMap((k) => (best.has(k) ? [best.get(k)!] : []))
}

export type MilestonePlayer = {
  id: number; name: string; slug: string; active: boolean; manualYears: string; baseline: Baseline
}
export type BoardApproaching = Approaching & { playerId: number; name: string; slug: string }
export type BoardAchieved = Achieved & { playerId: number; name: string; slug: string }
export type MilestoneBoard = { approaching: BoardApproaching[]; achievedNow: BoardAchieved[] }

/**
 * Club-wide milestone board for the public strip and the admin widget. `onlyActive` is on for
 * the public strip. `achievedNow` lists milestones crossed in `currentSeason` (data-defined).
 */
export function buildMilestoneBoard(o: {
  players: readonly MilestonePlayer[]
  rows: readonly StatRow[]
  windowStart: string | null
  currentSeason: string | null
  config: MilestoneConfig
  onlyActive: boolean
}): MilestoneBoard {
  const byPlayer = new Map<number, StatRow[]>()
  for (const r of o.rows) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r])
  const approaching: BoardApproaching[] = []
  const achievedNow: BoardAchieved[] = []
  const current = o.currentSeason ? shortSeason(o.currentSeason) : null
  for (const p of o.players) {
    if (o.onlyActive && !p.active) continue
    const seasons = mergeBySeason(byPlayer.get(p.id) ?? [])
    if (seasons.length === 0 && !MILESTONE_KEYS.some((k) => p.baseline[k] > 0)) continue
    const m = milestonesFor({ seasons, baseline: p.baseline, manualYears: p.manualYears, windowStart: o.windowStart, config: o.config })
    for (const a of m.approaching) approaching.push({ ...a, playerId: p.id, name: p.name, slug: p.slug })
    if (current) for (const a of m.achieved) if (a.reachedIn === current) achievedNow.push({ ...a, playerId: p.id, name: p.name, slug: p.slug })
  }
  const ratio = (a: Approaching, w: Record<MilestoneKey, number>) => a.remaining / Math.max(1, w[a.key])
  approaching.sort((a, b) => ratio(a, o.config.window) - ratio(b, o.config.window) || a.remaining - b.remaining || a.name.localeCompare(b.name))
  achievedNow.sort((a, b) => b.threshold - a.threshold || a.name.localeCompare(b.name))
  return { approaching, achievedNow }
}

const UNITS: Record<MilestoneKey, [string, string]> = { games: ['game', 'games'], runs: ['run', 'runs'], wickets: ['wicket', 'wickets'], catches: ['catch', 'catches'] }
export const unitOf = (key: MilestoneKey, n: number): string => UNITS[key][n === 1 ? 0 : 1]

/** "100 games", "1,000 runs". */
export const milestoneName = (key: MilestoneKey, threshold: number): string => `${threshold.toLocaleString('en-AU')} ${unitOf(key, threshold)}`

/** "1 game to go for 100 games". */
export const describeApproaching = (a: Pick<Approaching, 'key' | 'threshold' | 'remaining'>): string =>
  `${a.remaining.toLocaleString('en-AU')} ${unitOf(a.key, a.remaining)} to go for ${milestoneName(a.key, a.threshold)}`

/** "100 games, reached in 2024/25" or "100 games, since 2023/24" (windowLabel is e.g. "2023/24"). */
export function describeAchieved(a: Achieved, windowLabel: string | null): string {
  const name = milestoneName(a.key, a.threshold)
  if (a.reachedIn) return `${name}, reached in ${a.reachedIn}`
  if (a.sinceWindow && windowLabel) return `${name}, since ${windowLabel}`
  return name
}
