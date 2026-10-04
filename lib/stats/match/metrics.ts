import type { MetricGroup } from '../metrics'
import type { MatchMinimums } from './minimums'
import type { MatchCounts } from './types'

/**
 * Match metric registry (W2 spec 4.3). Mirrors `Metric` but reads `MatchCounts`, names what data it
 * needs, and reports how many rows stand behind a value. A value is null (shown as a dash) when the
 * denominator rows are missing, never zero.
 */
export type MatchNeed = 'balls' | 'bowling' | 'fow' | 'fielding' | null
export type MatchQualifier = 'count' | 'dismissals' | 'innings' | 'winGames' | 'ballsForBoundary' | 'fiftyScores'

export type MatchMetric = {
  key: string
  label: string
  short: string
  group: MetricGroup
  value: (c: MatchCounts) => number | null
  format: (c: MatchCounts) => string
  higherIsBetter: boolean
  qualifier: MatchQualifier
  needs: MatchNeed
  /** Plain-English rule shown as help text. */
  help: string
  /** Rows behind the value, null when the metric needs no special data. */
  coverage: (c: MatchCounts) => { known: number; total: number } | null
}

const dp = (v: number | null, n: number) => (v == null ? '–' : v.toFixed(n))
const int = (v: number | null) => (v == null ? '–' : String(Math.round(v)))

function count(
  key: string, label: string, short: string, group: MetricGroup, value: MatchMetric['value'], help: string,
  opts: { needs?: MatchNeed; coverage?: MatchMetric['coverage'] } = {},
): MatchMetric {
  return {
    key, label, short, group, value, format: (c) => int(value(c)), higherIsBetter: true, qualifier: 'count', needs: opts.needs ?? null, help,
    coverage: opts.coverage ?? (() => null),
  }
}

function rate(
  key: string, label: string, short: string, group: MetricGroup, value: MatchMetric['value'], qualifier: MatchQualifier, help: string,
  opts: { digits?: number; higherIsBetter?: boolean; needs?: MatchNeed; coverage?: MatchMetric['coverage'] } = {},
): MatchMetric {
  return {
    key, label, short, group, value, format: (c) => dp(value(c), opts.digits ?? 1), higherIsBetter: opts.higherIsBetter ?? true, qualifier,
    needs: opts.needs ?? null, help, coverage: opts.coverage ?? (() => null),
  }
}

const share = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)

export const MATCH_METRICS: readonly MatchMetric[] = [
  count('fifties', 'Fifties', '50s', 'batting', (c) => c.fifties, 'Scores of 50 to 99, out or not out. Counts recorded innings only.'),
  count('hundreds', 'Hundreds', '100s', 'batting', (c) => c.hundreds, 'Scores of 100 or more. A hundred is not also counted as a fifty.'),
  count('ducks', 'Ducks', 'Ducks', 'batting', (c) => c.ducks, 'Out for nought. A not-out 0 or a retirement is not a duck.'),
  count('goldenDucks', 'Golden ducks', 'GD', 'batting', (c) => (c.ducks > 0 && c.ducksWithBalls === 0 ? null : c.goldenDucks), 'Out first ball. Only decided for innings with balls faced recorded.', {
    needs: 'balls', coverage: (c) => ({ known: c.ducksWithBalls, total: c.ducks }),
  }),
  count('fiveFors', 'Five-wicket hauls', '5W', 'bowling', (c) => c.fiveFors, 'Five or more wickets in an innings. Counts recorded bowling figures only.', {
    needs: 'bowling', coverage: (c) => ({ known: c.bowlingInnings, total: c.bowlingInnings }),
  }),
  count('threeFors', 'Three-wicket hauls', '3W', 'bowling', (c) => c.threeFors, 'Three or more wickets in an innings. Counts recorded bowling figures only.', { needs: 'bowling' }),
  count('runOuts', 'Run outs', 'RO', 'fielding', (c) => (c.fieldingInnings > 0 ? c.runOuts : null), 'Run outs credited on the scorecard (assisted and unassisted). Innings with no fielding record are not counted.', {
    needs: 'fielding', coverage: (c) => ({ known: c.fieldingInnings, total: c.fieldingInnings }),
  }),
  count('stumpings', 'Stumpings', 'St', 'fielding', (c) => (c.fieldingInnings > 0 ? c.stumpings : null), 'Stumpings credited on the scorecard. Innings with no fielding record are not counted.', {
    needs: 'fielding', coverage: (c) => ({ known: c.fieldingInnings, total: c.fieldingInnings }),
  }),
  count('wins', 'Wins', 'W', 'games', (c) => c.wins, 'Games the side won. Forfeits are never a win.'),
  rate('winPct', 'Win percentage', 'Win%', 'games', (c) => (c.resultGames >= 1 ? share(c.wins, c.resultGames) : null), 'winGames', 'Wins over games with a result. Excludes forfeits and no-result games.'),
  rate('bowledPct', 'Dismissed bowled %', 'Bwd%', 'batting', (c) => share(c.dismissals.bowled, c.outs - c.dismissalsNotRecorded), 'dismissals', 'Share of dismissals with a recorded type that were bowled.', { higherIsBetter: false }),
  rate('caughtPct', 'Dismissed caught %', 'Ct%', 'batting', (c) => share(c.dismissals.caught + c.dismissals.caught_and_bowled, c.outs - c.dismissalsNotRecorded), 'dismissals', 'Share of dismissals with a recorded type that were caught (including caught and bowled).', { higherIsBetter: false }),
  rate('lbwPct', 'Dismissed LBW %', 'LBW%', 'batting', (c) => share(c.dismissals.lbw, c.outs - c.dismissalsNotRecorded), 'dismissals', 'Share of dismissals with a recorded type that were LBW.', { higherIsBetter: false }),
  rate('notOutPct', 'Not out %', 'NO%', 'batting', (c) => share(c.notOuts, c.battingInnings), 'innings', 'Share of innings that ended not out.'),
  rate('avgPosition', 'Average batting position (as scored)', 'Pos', 'batting', (c) => (c.positionCount > 0 ? c.positionSum / c.positionCount : null), 'innings', 'Average card position as the scorer recorded it, not proof of arrival order.', { higherIsBetter: false }),
  rate('ballsPerBoundary', 'Balls per boundary', 'B/Bdy', 'batting', (c) => (c.boundaries > 0 ? c.boundaryBalls / c.boundaries : null), 'ballsForBoundary', 'Balls faced per four or six, over innings with balls recorded (a missing four or six count as none).', {
    higherIsBetter: false, needs: 'balls', coverage: (c) => ({ known: c.boundaryInnings, total: c.battingInnings }),
  }),
  rate('fiftyConversion', 'Fifty conversion', 'Conv%', 'batting', (c) => share(c.hundreds, c.fifties + c.hundreds), 'fiftyScores', 'Hundreds as a share of scores of 50 or more (needs five such scores).'),
]

const BY_KEY = new Map(MATCH_METRICS.map((m) => [m.key, m]))
export const getMatchMetric = (key: string): MatchMetric | undefined => BY_KEY.get(key)

/** Match metrics offered on the leaderboard page. */
export const MATCH_LEADERBOARD_KEYS: readonly string[] = ['fifties', 'hundreds', 'fiveFors', 'runOuts', 'stumpings', 'goldenDucks', 'ducks']
export const matchLeaderboardMetrics = (group: MetricGroup): MatchMetric[] =>
  MATCH_LEADERBOARD_KEYS.map((k) => BY_KEY.get(k)!).filter((m) => m.group === group)

/** Does the player meet the sample size the metric needs? Count metrics need a value above zero (checked by the ranker). */
export function matchQualifies(q: MatchQualifier, c: MatchCounts, min: MatchMinimums): boolean {
  switch (q) {
    case 'count': return true
    case 'dismissals': return c.outs - c.dismissalsNotRecorded >= min.rateInnings
    case 'innings': return c.battingInnings >= min.rateInnings
    case 'winGames': return c.resultGames >= min.winGames
    case 'ballsForBoundary': return c.boundaryBalls >= min.ballsForBoundary
    case 'fiftyScores': return c.fifties + c.hundreds >= 5
  }
}

export function matchQualifierText(q: MatchQualifier, min: MatchMinimums): string | null {
  switch (q) {
    case 'count': return null
    case 'dismissals': return `Needs ${min.rateInnings} dismissals with a recorded type.`
    case 'innings': return `Needs ${min.rateInnings} innings.`
    case 'winGames': return `Needs ${min.winGames} games with a result.`
    case 'ballsForBoundary': return `Needs ${min.ballsForBoundary} balls faced.`
    case 'fiftyScores': return 'Needs five scores of 50 or more.'
  }
}

export type MatchBoardItem = { playerId: number; counts: MatchCounts }
export type MatchRanked = { rank: number; item: MatchBoardItem; value: number; display: string }
export type MatchRankResult = { ranked: MatchRanked[]; unqualified: MatchBoardItem[] }

/** Rank players by a match metric: a count board lists everyone above zero, a rate board needs its sample size. */
export function rankMatchBy(items: readonly MatchBoardItem[], metric: MatchMetric, min: MatchMinimums): MatchRankResult {
  const eligible: MatchBoardItem[] = []
  const unqualified: MatchBoardItem[] = []
  for (const it of items) {
    const v = metric.value(it.counts)
    if (v === null || !Number.isFinite(v)) continue
    if (metric.qualifier === 'count') {
      if (v > 0) eligible.push(it)
    } else if (matchQualifies(metric.qualifier, it.counts, min)) eligible.push(it)
    else unqualified.push(it)
  }
  const scored = eligible
    .map((item) => ({ item, value: metric.value(item.counts) as number }))
    .sort((a, b) => (metric.higherIsBetter ? b.value - a.value : a.value - b.value) || a.item.playerId - b.item.playerId)
  let rank = 0
  const ranked = scored.map((s, i) => {
    if (i === 0 || s.value !== scored[i - 1].value) rank = i + 1
    return { rank, item: s.item, value: s.value, display: metric.format(s.item.counts) }
  })
  return { ranked, unqualified }
}
