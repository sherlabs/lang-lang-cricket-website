import { INSIGHTS, NO_SEASON_LABEL } from '@/config/site'
import { byDate, type GameView } from './games'
import { mean } from './num'

/** Team trends (wave E, WP-3, spec 5.3): the results strip, season averages and a rolling first-innings total. Pure. */
export type StripCode = 'W' | 'L' | 'D' | 'T' | 'NR'
export type StripEntry = { key: string; date: string | null; opp: string; grade: string | null; code: StripCode; forfeit: boolean }

const CODE: Record<string, StripCode> = { won: 'W', lost: 'L', draw: 'D', tie: 'T', no_result: 'NR' }

/** The latest `n` games with a result, oldest first (left to right). A forfeit keeps its result and is marked. */
export function lastResults(games: readonly GameView[], n: number = INSIGHTS.stripGames, gradeLabel: (g: string | null) => string | null = (g) => g): StripEntry[] {
  return [...games]
    .filter((g) => g.header.result && CODE[g.header.result])
    .sort(byDate)
    .slice(-n)
    .map((g) => ({ key: String(g.header.id), date: g.header.date, opp: g.header.oppLabel, grade: gradeLabel(g.header.grade), code: CODE[g.header.result as string], forfeit: g.header.forfeit }))
}

export type SeasonAverage = { season: string; startYear: number | null; games: number; forAvg: number | null; forN: number; againstAvg: number | null; againstN: number }

/** Mean team total for and against per season (innings with a stored total only), oldest first, newest `max` seasons. A game with no season recorded is not a season, so it is left out of this chart. */
export function seasonAverages(games: readonly GameView[], max: number = INSIGHTS.trendSeasons): { rows: SeasonAverage[]; cut: number } {
  const by = new Map<string, { startYear: number | null; games: number; f: number[]; a: number[] }>()
  for (const g of games) {
    if (g.header.seasonName === NO_SEASON_LABEL) continue
    const e = by.get(g.header.seasonName) ?? { startYear: g.header.seasonStartYear, games: 0, f: [], a: [] }
    e.games++
    for (const i of g.innings) if (i.runs !== null) (i.clubBatting ? e.f : e.a).push(i.runs)
    by.set(g.header.seasonName, e)
  }
  const all = [...by]
    .map(([season, e]) => ({ season, startYear: e.startYear, games: e.games, forAvg: mean(e.f), forN: e.f.length, againstAvg: mean(e.a), againstN: e.a.length }))
    .sort((x, y) => (x.startYear ?? 9999) - (y.startYear ?? 9999) || x.season.localeCompare(y.season))
  return { rows: all.slice(-max), cut: Math.max(0, all.length - max) }
}

export type FirstInningsPoint = { key: string; date: string | null; opp: string; total: number; rolling: number | null }

/** Our total when we batted first, in time order, with a rolling mean drawn only once a full window of such innings exists. */
export function rollingFirstInnings(games: readonly GameView[], window: number = INSIGHTS.rollingInnings): FirstInningsPoint[] {
  const rows = [...games].sort(byDate).flatMap((g) => (g.battedFirst === true && g.innings[0]?.runs != null ? [{ g, total: g.innings[0].runs as number }] : []))
  return rows.map((r, i) => {
    const w = rows.slice(Math.max(0, i - window + 1), i + 1)
    return { key: String(r.g.header.id), date: r.g.header.date, opp: r.g.header.oppLabel, total: r.total, rolling: w.length === window ? mean(w.map((x) => x.total)) : null }
  })
}
