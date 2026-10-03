import type { SeasonCounts } from '@/lib/players/season-math'

/** Qualification minimums (spec 3.3). Career means the stored window, not a full playing career. */
export type QualScope = { batAvgRuns: number; batAvgInnings: number; srBalls: number; bowlAvgWickets: number; econBalls: number }
export type QualConfig = { career: QualScope; season: QualScope }

export const DEFAULT_QUALIFICATION: QualConfig = {
  career: { batAvgRuns: 300, batAvgInnings: 8, srBalls: 300, bowlAvgWickets: 25, econBalls: 300 },
  season: { batAvgRuns: 100, batAvgInnings: 5, srBalls: 100, bowlAvgWickets: 8, econBalls: 120 },
}

/**
 * What a metric needs before it is ranked. `count` metrics need a non-zero value;
 * the rest map to the scope minimums above.
 */
export type Qualifier = 'count' | 'batAvg' | 'sr' | 'bowlAvg' | 'econ'

export function qualifies(q: Qualifier, c: SeasonCounts, scope: QualScope): boolean {
  switch (q) {
    case 'count': return true
    case 'batAvg': return c.batRuns >= scope.batAvgRuns && c.batInnings >= scope.batAvgInnings
    case 'sr': return c.batBalls >= scope.srBalls
    case 'bowlAvg': return c.bowlWickets >= scope.bowlAvgWickets
    case 'econ': return c.bowlBalls >= scope.econBalls
  }
}

/** Human text for a table caption, e.g. "Batting average needs 300 runs and 8 innings." */
export function qualifierText(q: Qualifier, scope: QualScope): string | null {
  switch (q) {
    case 'count': return null
    case 'batAvg': return `Batting average needs ${scope.batAvgRuns} runs and ${scope.batAvgInnings} innings.`
    case 'sr': return `Strike rate needs ${scope.srBalls} balls faced.`
    case 'bowlAvg': return `Bowling average needs ${scope.bowlAvgWickets} wickets.`
    case 'econ': return `Economy needs ${scope.econBalls} balls bowled (${Math.round(scope.econBalls / 6)} overs).`
  }
}
