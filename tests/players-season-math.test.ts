import { describe, it, expect } from 'vitest'
import { EMPTY_COUNTS, combineCounts, countsFromStats } from '@/lib/players/season-math'
import type { PlayerSeasonStats } from '@/lib/playhq/types'

const c = (o: Partial<typeof EMPTY_COUNTS>) => ({ ...EMPTY_COUNTS, ...o })

describe('combineCounts', () => {
  it('sums counting stats', () => {
    const r = combineCounts(c({ games: 2, batRuns: 30, bowlBalls: 12, catches: 1 }), c({ games: 3, batRuns: 12, bowlBalls: 6, catches: 2 }))
    expect(r).toMatchObject({ games: 5, batRuns: 42, bowlBalls: 18, catches: 3 })
  })
  it('keeps the higher score; not-out wins ties', () => {
    expect(combineCounts(c({ batHighScore: 50 }), c({ batHighScore: 80 }))).toMatchObject({ batHighScore: 80, batHighScoreNotOut: false })
    expect(combineCounts(c({ batHighScore: 50 }), c({ batHighScore: 50, batHighScoreNotOut: true }))).toMatchObject({ batHighScore: 50, batHighScoreNotOut: true })
  })
  it('best bowling: more wickets, then fewer runs', () => {
    expect(combineCounts(c({ bowlBestWickets: 3, bowlBestRuns: 20 }), c({ bowlBestWickets: 4, bowlBestRuns: 40 }))).toMatchObject({ bowlBestWickets: 4, bowlBestRuns: 40 })
    expect(combineCounts(c({ bowlBestWickets: 3, bowlBestRuns: 20 }), c({ bowlBestWickets: 3, bowlBestRuns: 15 }))).toMatchObject({ bowlBestWickets: 3, bowlBestRuns: 15 })
  })
  it('an empty side never wins best bowling over a real 0-wicket spell', () => {
    // EMPTY has bowlBalls 0 — best from the side that bowled
    expect(combineCounts(EMPTY_COUNTS, c({ bowlBalls: 24, bowlBestWickets: 0, bowlBestRuns: 30 }))).toMatchObject({ bowlBestWickets: 0, bowlBestRuns: 30 })
  })
})

describe('countsFromStats', () => {
  it('maps PlayerSeasonStats', () => {
    const s = {
      key: 'a|b', name: 'A B', firstName: 'A', lastName: 'B', games: 4,
      batting: { innings: 4, notOuts: 1, runs: 99, highScore: 45, highScoreNotOut: true, balls: 120, fours: 10, sixes: 2, average: 33, strikeRate: 82.5 },
      bowling: { balls: 60, overs: '10', maidens: 1, runs: 40, wickets: 3, bestWickets: 2, bestRuns: 11, average: 13.33, economy: 4 },
      catches: 2,
    } satisfies PlayerSeasonStats
    expect(countsFromStats({ ...s, batting: { ...s.batting, runsUnballed: 12 } }).batRunsUnballed).toBe(12)
    expect(countsFromStats(s)).toEqual({
      games: 4, batInnings: 4, batNotOuts: 1, batRuns: 99, batHighScore: 45, batHighScoreNotOut: true, batBalls: 120, batFours: 10, batSixes: 2, batRunsUnballed: 0,
      bowlBalls: 60, bowlMaidens: 1, bowlRuns: 40, bowlWickets: 3, bowlBestWickets: 2, bowlBestRuns: 11, catches: 2,
    })
  })
})
