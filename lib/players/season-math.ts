import type { PlayerSeasonStats } from '@/lib/playhq/types'

export type SeasonCounts = {
  games: number; batInnings: number; batNotOuts: number; batRuns: number; batHighScore: number; batHighScoreNotOut: boolean
  batBalls: number; batFours: number; batSixes: number; bowlBalls: number; bowlMaidens: number; bowlRuns: number
  bowlWickets: number; bowlBestWickets: number; bowlBestRuns: number; catches: number
}

export const EMPTY_COUNTS: SeasonCounts = {
  games: 0, batInnings: 0, batNotOuts: 0, batRuns: 0, batHighScore: 0, batHighScoreNotOut: false, batBalls: 0, batFours: 0, batSixes: 0,
  bowlBalls: 0, bowlMaidens: 0, bowlRuns: 0, bowlWickets: 0, bowlBestWickets: 0, bowlBestRuns: 0, catches: 0,
}

export function countsFromStats(s: PlayerSeasonStats): SeasonCounts {
  return {
    games: s.games,
    batInnings: s.batting.innings, batNotOuts: s.batting.notOuts, batRuns: s.batting.runs,
    batHighScore: s.batting.highScore, batHighScoreNotOut: s.batting.highScoreNotOut,
    batBalls: s.batting.balls, batFours: s.batting.fours, batSixes: s.batting.sixes,
    bowlBalls: s.bowling.balls, bowlMaidens: s.bowling.maidens, bowlRuns: s.bowling.runs, bowlWickets: s.bowling.wickets,
    bowlBestWickets: s.bowling.bestWickets, bowlBestRuns: s.bowling.bestRuns,
    catches: s.catches,
  }
}

/** Strip a DB row / planned row down to its counts. */
export function pickCounts(row: SeasonCounts): SeasonCounts {
  const out = { ...EMPTY_COUNTS }
  for (const k of Object.keys(EMPTY_COUNTS) as (keyof SeasonCounts)[]) (out as Record<string, unknown>)[k] = row[k]
  return out
}

function betterBowling(a: SeasonCounts, b: SeasonCounts): SeasonCounts {
  if (a.bowlBalls === 0) return b
  if (b.bowlBalls === 0) return a
  if (b.bowlBestWickets > a.bowlBestWickets) return b
  if (b.bowlBestWickets === a.bowlBestWickets && b.bowlBestRuns < a.bowlBestRuns) return b
  return a
}

function betterBatting(a: SeasonCounts, b: SeasonCounts): SeasonCounts {
  if (b.batHighScore > a.batHighScore) return b
  if (b.batHighScore === a.batHighScore && b.batHighScoreNotOut && !a.batHighScoreNotOut) return b
  return a
}

export function combineCounts(a: SeasonCounts, b: SeasonCounts): SeasonCounts {
  const bat = betterBatting(a, b), bowl = betterBowling(a, b)
  return {
    games: a.games + b.games,
    batInnings: a.batInnings + b.batInnings, batNotOuts: a.batNotOuts + b.batNotOuts, batRuns: a.batRuns + b.batRuns,
    batHighScore: bat.batHighScore, batHighScoreNotOut: bat.batHighScoreNotOut,
    batBalls: a.batBalls + b.batBalls, batFours: a.batFours + b.batFours, batSixes: a.batSixes + b.batSixes,
    bowlBalls: a.bowlBalls + b.bowlBalls, bowlMaidens: a.bowlMaidens + b.bowlMaidens, bowlRuns: a.bowlRuns + b.bowlRuns,
    bowlWickets: a.bowlWickets + b.bowlWickets,
    bowlBestWickets: bowl.bowlBestWickets, bowlBestRuns: bowl.bowlBestRuns,
    catches: a.catches + b.catches,
  }
}
