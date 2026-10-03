import { statLabHref, type StatLabParams } from './statlab'

/**
 * Quick reports (spec A11). A preset is only a set of StatLab params, so it is also a URL: the
 * same canonical href the form produces. Minimums are scaled to the since-2023/24 window.
 */
export type Preset = { key: string; label: string; blurb: string; params: Partial<StatLabParams> }

const asc = (key: string) => ({ key, dir: 'asc' as const })
const desc = (key: string) => ({ key, dir: 'desc' as const })

export const PRESETS: readonly Preset[] = [
  { key: 'top-run-scorers', label: 'Top run scorers', blurb: 'Most runs, all seasons.', params: { cols: ['games', 'innings', 'runs', 'hs', 'avg'], sort: desc('runs'), mins: { runs: 1 } } },
  { key: 'best-averages', label: 'Best batting averages', blurb: 'At least 300 runs and 8 innings.', params: { cols: ['innings', 'runs', 'hs', 'avg'], sort: desc('avg'), mins: { runs: 300, innings: 8 } } },
  { key: 'hard-hitters', label: 'Hard hitters', blurb: 'Strike rate and boundaries, at least 200 runs.', params: { cols: ['runs', 'sr', 'sixes', 'fours', 'boundaryPct'], sort: desc('sr'), mins: { runs: 200 } } },
  { key: 'strike-bowlers', label: 'Strike bowlers', blurb: 'Most wickets, at least 10.', params: { cols: ['games', 'overs', 'wickets', 'bowlSR', 'bowlAvg', 'best'], sort: desc('wickets'), mins: { wickets: 10 } } },
  { key: 'economical-bowlers', label: 'Economical bowlers', blurb: 'Lowest economy, at least 50 overs.', params: { cols: ['overs', 'wickets', 'econ', 'bowlAvg'], sort: asc('econ'), mins: { overs: 50 } } },
  { key: 'maiden-makers', label: 'Maiden makers', blurb: 'Most maiden overs.', params: { cols: ['overs', 'maidens', 'wickets', 'econ'], sort: desc('maidens'), mins: { maidens: 1 } } },
  { key: 'best-seasons', label: 'Best seasons', blurb: 'The biggest single seasons for runs.', params: { scope: 'season', cols: ['games', 'runs', 'hs', 'avg', 'wickets'], sort: desc('runs'), mins: { runs: 100 } } },
  { key: 'all-rounders', label: 'All-rounders', blurb: 'At least 200 runs and 15 wickets.', params: { cols: ['games', 'runs', 'avg', 'wickets', 'bowlAvg'], sort: desc('runs'), mins: { runs: 200, wickets: 15 } } },
  { key: 'catching-machines', label: 'Catching machines', blurb: 'Most catches, and catches per game.', params: { cols: ['games', 'catches', 'catchesPerGame'], sort: desc('catches'), mins: { catches: 1 } } },
  { key: 'most-capped', label: 'Most capped', blurb: 'Most games played.', params: { cols: ['games', 'runs', 'wickets', 'catches'], sort: desc('games'), mins: { games: 1 } } },
  { key: 'rising-stars', label: 'Rising stars', blurb: 'Three seasons or fewer, ranked by runs per game.', params: { maxSeasons: 3, cols: ['games', 'runs', 'runsPerGame', 'wickets'], sort: desc('runsPerGame'), mins: { games: 8 } } },
  { key: 'active-squad', label: 'Active squad snapshot', blurb: 'Current players only.', params: { active: true, cols: ['games', 'runs', 'avg', 'wickets', 'catches'], sort: desc('games') } },
]

/** A preset as a canonical StatLab link. */
export const presetHref = (p: Preset, base = '/statlab'): string => statLabHref(base, p.params)
