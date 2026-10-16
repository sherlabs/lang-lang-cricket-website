import { battingAverages, bowlingAverages } from '@/lib/playhq/players'
import type { SeasonCounts } from '@/lib/players/season-math'
import type { Qualifier } from './qualify'

/**
 * Metric registry (spec 3.1): one definition of each stat, used by leaderboards, records,
 * StatLab and comparison.
 *
 * Not available, on purpose, because the database stores season aggregates and no per-match
 * rows (spec section 2, Tier B): counts of 50s, 100s, ducks and 5-wicket hauls, dismissal
 * breakdown, run-outs and stumpings, opposition analysis, batting position, partnerships,
 * recent form, best innings figures beyond a player's single best. Nothing here estimates them.
 */
export type MetricGroup = 'batting' | 'bowling' | 'fielding' | 'games'

export type Metric = {
  key: string
  label: string
  /** Short column heading. */
  short: string
  group: MetricGroup
  /** Numeric value used for ranking; null when not defined (no dismissals, no balls). */
  value: (c: SeasonCounts) => number | null
  /** Display text for the value (high score and best figures need more than the number). */
  format: (c: SeasonCounts) => string
  higherIsBetter: boolean
  qualifier: Qualifier
}

const dp = (v: number | null, n: number) => (v == null ? '–' : v.toFixed(n))
const int = (v: number | null) => (v == null ? '–' : String(Math.round(v)))
const per = (n: number, d: number) => (d > 0 ? n / d : null)

const bat = (c: SeasonCounts) => battingAverages({ runs: c.batRuns, innings: c.batInnings, notOuts: c.batNotOuts, balls: c.batBalls, runsUnballed: c.batRunsUnballed })
const bowl = (c: SeasonCounts) => bowlingAverages({ balls: c.bowlBalls, runs: c.bowlRuns, wickets: c.bowlWickets })

function simple(
  key: string, label: string, short: string, group: MetricGroup, value: Metric['value'],
  opts: { digits?: number; higherIsBetter?: boolean; qualifier?: Qualifier } = {},
): Metric {
  const digits = opts.digits ?? 0
  return {
    key, label, short, group, value,
    format: (c) => (digits === 0 ? int(value(c)) : dp(value(c), digits)),
    higherIsBetter: opts.higherIsBetter ?? true,
    qualifier: opts.qualifier ?? 'count',
  }
}

export const METRICS: readonly Metric[] = [
  simple('games', 'Games', 'M', 'games', (c) => c.games),
  simple('runs', 'Runs', 'Runs', 'batting', (c) => c.batRuns),
  simple('avg', 'Batting average', 'Avg', 'batting', (c) => bat(c).average, { digits: 2, qualifier: 'batAvg' }),
  {
    key: 'hs', label: 'High score', short: 'HS', group: 'batting',
    // 0.5 breaks a tie in favour of the not-out score; display is separate.
    value: (c) => (c.batInnings > 0 ? c.batHighScore + (c.batHighScoreNotOut ? 0.5 : 0) : null),
    format: (c) => (c.batInnings > 0 ? `${c.batHighScore}${c.batHighScoreNotOut ? '*' : ''}` : '–'),
    higherIsBetter: true, qualifier: 'count',
  },
  simple('sr', 'Strike rate', 'SR', 'batting', (c) => bat(c).strikeRate, { digits: 1, qualifier: 'sr' }),
  simple('sixes', 'Sixes', '6s', 'batting', (c) => c.batSixes),
  simple('fours', 'Fours', '4s', 'batting', (c) => c.batFours),
  simple('innings', 'Innings', 'Inns', 'batting', (c) => c.batInnings),
  simple('notOuts', 'Not outs', 'NO', 'batting', (c) => c.batNotOuts),
  simple('balls', 'Balls faced', 'Balls', 'batting', (c) => c.batBalls),
  simple('boundaryPct', 'Boundary runs %', 'Bdy%', 'batting', (c) => (c.batRuns - c.batRunsUnballed > 0 ? ((c.batFours * 4 + c.batSixes * 6) / (c.batRuns - c.batRunsUnballed)) * 100 : null), { digits: 1, qualifier: 'sr' }),
  simple('runsPerGame', 'Runs per game', 'R/G', 'batting', (c) => per(c.batRuns, c.games), { digits: 1 }),
  simple('wickets', 'Wickets', 'Wkts', 'bowling', (c) => c.bowlWickets),
  simple('econ', 'Economy', 'Econ', 'bowling', (c) => bowl(c).economy, { digits: 2, higherIsBetter: false, qualifier: 'econ' }),
  simple('bowlAvg', 'Bowling average', 'Avg', 'bowling', (c) => bowl(c).average, { digits: 2, higherIsBetter: false, qualifier: 'bowlAvg' }),
  simple('bowlSR', 'Bowling strike rate', 'SR', 'bowling', (c) => (c.bowlWickets > 0 ? c.bowlBalls / c.bowlWickets : null), { digits: 1, higherIsBetter: false, qualifier: 'bowlAvg' }),
  {
    key: 'best', label: 'Best bowling', short: 'Best', group: 'bowling',
    // More wickets wins; fewer runs breaks the tie.
    value: (c) => (c.bowlBalls > 0 && c.bowlBestWickets > 0 ? c.bowlBestWickets * 1000 - c.bowlBestRuns : null),
    format: (c) => (c.bowlBalls > 0 && c.bowlBestWickets > 0 ? `${c.bowlBestWickets}/${c.bowlBestRuns}` : '–'),
    higherIsBetter: true, qualifier: 'count',
  },
  simple('maidens', 'Maidens', 'Mdns', 'bowling', (c) => c.bowlMaidens),
  {
    // Value is balls / 6 (a plain number to sort and filter on); display is cricket notation, e.g. 12.3.
    key: 'overs', label: 'Overs bowled', short: 'Overs', group: 'bowling',
    value: (c) => (c.bowlBalls > 0 ? c.bowlBalls / 6 : null),
    format: (c) => (c.bowlBalls > 0 ? bowl(c).overs : '–'),
    higherIsBetter: true, qualifier: 'count',
  },
  simple('bowlRuns', 'Runs conceded', 'Runs', 'bowling', (c) => (c.bowlBalls > 0 ? c.bowlRuns : null)),
  simple('wicketsPerGame', 'Wickets per game', 'W/G', 'bowling', (c) => per(c.bowlWickets, c.games), { digits: 2 }),
  simple('catches', 'Catches', 'Ct', 'fielding', (c) => c.catches),
  simple('catchesPerGame', 'Catches per game', 'Ct/G', 'fielding', (c) => per(c.catches, c.games), { digits: 2 }),
]

const BY_KEY = new Map(METRICS.map((m) => [m.key, m]))

export const METRIC_KEYS: readonly string[] = METRICS.map((m) => m.key)
export const getMetric = (key: string): Metric | undefined => BY_KEY.get(key)

export const GROUP_LABELS: Record<MetricGroup, string> = { batting: 'Batting', bowling: 'Bowling', fielding: 'Fielding', games: 'Games' }
export const GROUPS: readonly MetricGroup[] = ['batting', 'bowling', 'fielding', 'games']

/** Metrics offered on the leaderboard page (derived per-game metrics are StatLab-only). */
export const LEADERBOARD_METRIC_KEYS: readonly string[] = [
  'runs', 'avg', 'hs', 'sixes', 'fours', 'sr', 'wickets', 'econ', 'bowlAvg', 'best', 'maidens', 'catches', 'games',
]
export const leaderboardMetrics = (group: MetricGroup): Metric[] =>
  LEADERBOARD_METRIC_KEYS.map((k) => BY_KEY.get(k)!).filter((m) => m.group === group)
