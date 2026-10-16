import { INSIGHTS, NO_SEASON_LABEL } from '@/config/site'
import type { BatFact, BatStatus, BowlFact, FactSet, MatchHeader } from '@/lib/stats/match/types'
import { rollingBattingAverage, rollingEconomy } from './rolling'

/**
 * One player's trend data from their slice of the stored facts (wave E, WP-3, spec 5.2). Pure.
 * `null` is "not recorded", never 0. Strike rate and economy use only rows whose balls are recorded.
 */
export type BatPoint = {
  key: string
  date: string | null
  opp: string
  grade: string | null
  runs: number
  status: BatStatus
  balls: number | null
  duck: boolean
  rolling: number | null
}

export type BowlPoint = {
  key: string
  date: string | null
  opp: string
  grade: string | null
  balls: number
  runs: number
  wickets: number
  rolling: number | null
}

const dateKey = (h: MatchHeader | undefined) => h?.date ?? '9999-12-31'

function byTime<T extends { m: number; seq: number }>(set: FactSet, rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => dateKey(set.matches.get(a.m)).localeCompare(dateKey(set.matches.get(b.m))) || a.m - b.m || a.seq - b.seq)
}

type Opts = { window?: number; minOuts?: number; minSpells?: number; gradeLabel?: (g: string | null) => string | null }

export function battingPoints(set: FactSet, playerId: number, o: Opts = {}): BatPoint[] {
  const rows: BatFact[] = byTime(set, set.bat.filter((r) => r.player === playerId))
  const rolling = rollingBattingAverage(rows, o.window ?? INSIGHTS.rollingInnings, o.minOuts ?? INSIGHTS.minOuts)
  return rows.map((r, i) => {
    const h = set.matches.get(r.m)
    return {
      key: `${r.m}:${r.seq}`, date: h?.date ?? null, opp: h?.oppLabel ?? '', grade: o.gradeLabel ? o.gradeLabel(h?.grade ?? null) : (h?.grade ?? null),
      runs: r.runs, status: r.status, balls: r.balls, duck: r.status === 'out' && r.runs === 0 && r.dismissal !== 'retired_out', rolling: rolling[i],
    }
  })
}

export function bowlingPoints(set: FactSet, playerId: number, o: Opts = {}): BowlPoint[] {
  const rows: BowlFact[] = byTime(set, set.bowl.filter((r) => r.player === playerId && r.balls > 0))
  const rolling = rollingEconomy(rows, o.window ?? INSIGHTS.rollingInnings, o.minSpells ?? INSIGHTS.minSpells)
  return rows.map((r, i) => {
    const h = set.matches.get(r.m)
    return {
      key: `${r.m}:${r.seq}`, date: h?.date ?? null, opp: h?.oppLabel ?? '', grade: o.gradeLabel ? o.gradeLabel(h?.grade ?? null) : (h?.grade ?? null),
      balls: r.balls, runs: r.runs, wickets: r.wickets, rolling: rolling[i],
    }
  })
}

/** One season of a player's figures, every rate with the sample behind it. */
export type SeasonLine = {
  season: string
  startYear: number | null
  games: number
  /** Batting rows (every status). */
  innings: number
  /** Rows with a known status: the ones the average is over. */
  usedInnings: number
  outs: number
  /** Runs of the known-status rows. */
  runs: number
  /** Null with no dismissal ("not out" when the player was never out). */
  average: number | null
  /** Rows with balls recorded, and the rate over them. */
  ballInnings: number
  strikeRate: number | null
  wickets: number
  spells: number
  bowlBalls: number
  economy: number | null
  /** Spells with balls bowled (the ones economy is over). */
  economySpells: number
}

export function seasonLines(set: FactSet, playerId: number): SeasonLine[] {
  const lines = new Map<string, SeasonLine & { matchIds: Set<number> }>()
  const get = (h: MatchHeader) => {
    let l = lines.get(h.seasonName)
    if (!l) {
      l = {
        season: h.seasonName, startYear: h.seasonStartYear, games: 0, innings: 0, usedInnings: 0, outs: 0, runs: 0, average: null, ballInnings: 0, strikeRate: null,
        wickets: 0, spells: 0, bowlBalls: 0, economy: null, economySpells: 0, matchIds: new Set(),
      }
      lines.set(h.seasonName, l)
    }
    return l
  }
  const srRuns = new Map<string, number>(), srBalls = new Map<string, number>(), ecoRuns = new Map<string, number>()
  for (const a of set.appearances) {
    const h = set.matches.get(a.m)
    if (h && a.player === playerId) get(h).matchIds.add(a.m)
  }
  for (const r of set.bat) {
    const h = r.player === playerId ? set.matches.get(r.m) : undefined
    if (!h) continue
    const l = get(h)
    l.innings++
    if (r.status !== 'unknown') {
      l.usedInnings++
      l.runs += r.runs
      if (r.status === 'out') l.outs++
    }
    if (r.balls !== null && r.balls > 0) {
      l.ballInnings++
      srRuns.set(h.seasonName, (srRuns.get(h.seasonName) ?? 0) + r.runs)
      srBalls.set(h.seasonName, (srBalls.get(h.seasonName) ?? 0) + r.balls)
    }
  }
  for (const r of set.bowl) {
    const h = r.player === playerId ? set.matches.get(r.m) : undefined
    if (!h) continue
    const l = get(h)
    l.wickets += r.wickets
    l.spells++
    if (r.balls > 0) {
      l.economySpells++
      l.bowlBalls += r.balls
      ecoRuns.set(h.seasonName, (ecoRuns.get(h.seasonName) ?? 0) + r.runs)
    }
  }
  const out = [...lines.values()].map(({ matchIds, ...l }) => {
    l.games = matchIds.size
    l.average = l.outs >= 1 ? l.runs / l.outs : null
    const b = srBalls.get(l.season) ?? 0
    l.strikeRate = b > 0 ? ((srRuns.get(l.season) ?? 0) / b) * 100 : null
    l.economy = l.bowlBalls > 0 ? (ecoRuns.get(l.season) ?? 0) / (l.bowlBalls / 6) : null
    return l
  })
  // Games with no season recorded sort first, so the newest real season stays the default pick.
  const rank = (l: SeasonLine) => (l.season === NO_SEASON_LABEL ? -1 : (l.startYear ?? 9999))
  return out.sort((a, b) => rank(a) - rank(b) || a.season.localeCompare(b.season))
}

export type Direction = 'higher' | 'lower' | 'about the same'
export type CompareCell = { label: Direction } | { why: string }
export type SeasonComparison = { average: CompareCell; strikeRate: CompareCell; economy: CompareCell }

const NOT_ENOUGH = 'not enough games to compare'

function direction(a: number, b: number, share: number): Direction {
  if (a === b) return 'about the same'
  if (b === 0) return a > b ? 'higher' : 'lower'
  return Math.abs(a - b) > Math.abs(b) * share ? (a > b ? 'higher' : 'lower') : 'about the same'
}

/**
 * Direction of season `a` against season `b`. A label appears only when both seasons meet the sample (`minInnings` rows
 * for batting figures, `minBalls` balls for economy) and both figures exist; otherwise the cell says why not. A label is a
 * comparison of two numbers over a stated threshold, not a verdict on the player.
 */
export function compareSeasons(a: SeasonLine, b: SeasonLine, min: { innings: number; balls: number }, share: number = INSIGHTS.compareShare): SeasonComparison {
  const cell = (ok: boolean, x: number | null, y: number | null): CompareCell => (ok && x !== null && y !== null ? { label: direction(x, y, share) } : { why: NOT_ENOUGH })
  return {
    average: cell(a.usedInnings >= min.innings && b.usedInnings >= min.innings, a.average, b.average),
    strikeRate: cell(a.ballInnings >= min.innings && b.ballInnings >= min.innings, a.strikeRate, b.strikeRate),
    economy: cell(a.bowlBalls >= min.balls && b.bowlBalls >= min.balls, a.economy, b.economy),
  }
}
