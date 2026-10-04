import type { CareerRow, SeasonRow } from './aggregate'
import { getMetric } from './metrics'
import type { QualConfig } from './qualify'
import { rankBy, rankValues } from './rank'

export type RecordScope = 'since' | 'season'
export type RecordEntry = {
  rank: number
  playerId: number
  value: number
  display: string
  /** Season of a single-season record; null for the since-window records. */
  season: string | null
  grades: string[]
  isNew: boolean
}
export type RecordList = { key: string; title: string; scope: RecordScope; entries: RecordEntry[]; /** Rank-<=5 entries cut by the hard cap. */ moreTied: number }

/** Records listed per scope, in page order. `seasons` is the derived "most seasons played". */
const SINCE: { key: string; title: string; metric: string }[] = [
  { key: 'runs', title: 'Most runs', metric: 'runs' },
  { key: 'hs', title: 'Highest score', metric: 'hs' },
  { key: 'avg', title: 'Best batting average', metric: 'avg' },
  { key: 'sixes', title: 'Most sixes', metric: 'sixes' },
  { key: 'fours', title: 'Most fours', metric: 'fours' },
  { key: 'games', title: 'Most games', metric: 'games' },
  { key: 'seasons', title: 'Most seasons played', metric: '' },
  { key: 'wickets', title: 'Most wickets', metric: 'wickets' },
  { key: 'best', title: 'Best bowling figures', metric: 'best' },
  { key: 'maidens', title: 'Most maidens', metric: 'maidens' },
  { key: 'econ', title: 'Best economy', metric: 'econ' },
  { key: 'catches', title: 'Most catches', metric: 'catches' },
]
const SEASON: { key: string; title: string; metric: string }[] = [
  { key: 'runs', title: 'Most runs in a season', metric: 'runs' },
  { key: 'hs', title: 'Highest score in a season', metric: 'hs' },
  { key: 'avg', title: 'Best batting average in a season', metric: 'avg' },
  { key: 'wickets', title: 'Most wickets in a season', metric: 'wickets' },
  { key: 'best', title: 'Best bowling figures in a season', metric: 'best' },
  { key: 'econ', title: 'Best economy in a season', metric: 'econ' },
  { key: 'catches', title: 'Most catches in a season', metric: 'catches' },
]

const TOP = 5
const HARD_CAP = 10

/** Rank <= 5 keeps ties together; the hard cap stops a pile of equal values flooding the page. */
export const take = <T extends { rank: number }>(xs: T[]) => xs.filter((x) => x.rank <= TOP).slice(0, HARD_CAP)
export const moreTied = <T extends { rank: number }>(xs: T[]) => Math.max(0, xs.filter((x) => x.rank <= TOP).length - HARD_CAP)

export function buildRecords(input: {
  career: readonly CareerRow[]
  seasons: readonly SeasonRow[]
  /** Data-defined current season (`currentSeasonName`), or null. */
  currentSeason: string | null
  qual: QualConfig
}): { since: RecordList[]; season: RecordList[] } {
  const since: RecordList[] = []
  for (const def of SINCE) {
    if (def.key === 'seasons') {
      const r = rankValues(input.career, (c) => (c.seasons > 0 ? c.seasons : null), true)
      since.push({
        key: def.key, title: def.title, scope: 'since', moreTied: moreTied(r),
        entries: take(r).map((x) => ({ rank: x.rank, playerId: x.item.playerId, value: x.value, display: String(x.value), season: null, grades: x.item.gradeNames, isNew: false })),
      })
      continue
    }
    const metric = getMetric(def.metric)!
    const { ranked } = rankBy(input.career, metric, input.qual.career)
    since.push({
      key: def.key, title: def.title, scope: 'since', moreTied: moreTied(ranked),
      entries: take(ranked).map((x) => ({ rank: x.rank, playerId: x.item.playerId, value: x.value, display: x.display, season: null, grades: x.item.gradeNames, isNew: false })),
    })
  }
  const season: RecordList[] = []
  for (const def of SEASON) {
    const metric = getMetric(def.metric)!
    const { ranked } = rankBy(input.seasons, metric, input.qual.season)
    season.push({
      key: def.key, title: def.title, scope: 'season', moreTied: moreTied(ranked),
      entries: take(ranked).map((x) => ({
        rank: x.rank, playerId: x.item.playerId, value: x.value, display: x.display,
        season: x.item.seasonName, grades: x.item.gradeNames,
        isNew: x.rank === 1 && input.currentSeason !== null && x.item.seasonName === input.currentSeason,
      })),
    })
  }
  return { since, season }
}
