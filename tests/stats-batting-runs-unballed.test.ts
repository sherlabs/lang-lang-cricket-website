import { describe, expect, it } from 'vitest'
import { aggregateFromMatchRows } from '@/lib/match-store/aggregate'
import { aggregatePlayers, battingAverages } from '@/lib/playhq/players'
import { mapScorecard } from '@/lib/playhq/scorecard'
import { combineCounts, countsFromStats, EMPTY_COUNTS, pickCounts } from '@/lib/players/season-math'
import { getMetric } from '@/lib/stats/metrics'
import { counts } from './stats-helpers'
import type { RawGameSummary } from '@/lib/playhq/types'

describe('batRunsUnballed (the foundation gap: strike rate over partial ball data)', () => {
  it('is zero by default, summed by combineCounts and kept by pickCounts', () => {
    expect(EMPTY_COUNTS.batRunsUnballed).toBe(0)
    expect(combineCounts({ ...EMPTY_COUNTS, batRunsUnballed: 12 }, { ...EMPTY_COUNTS, batRunsUnballed: 8 }).batRunsUnballed).toBe(20)
    expect(pickCounts({ ...EMPTY_COUNTS, batRunsUnballed: 5 }).batRunsUnballed).toBe(5)
    // A row that predates the column still gives a number, not NaN.
    expect(pickCounts({ ...EMPTY_COUNTS, batRunsUnballed: undefined as unknown as number }).batRunsUnballed).toBe(0)
  })

  it('removes unballed runs from the strike rate and boundary share', () => {
    // 100 runs, 40 of them in an innings with no balls recorded: strike rate is 60 off 60 balls, not 100 off 60.
    const c = counts({ batRuns: 100, batBalls: 60, batFours: 6, batSixes: 2, batInnings: 3, batRunsUnballed: 40 })
    expect(getMetric('sr')!.value(c)).toBe(100)
    expect(getMetric('sr')!.value({ ...c, batRunsUnballed: 0 })).toBeCloseTo(166.67, 1)
    expect(getMetric('boundaryPct')!.value(c)).toBeCloseTo(((6 * 4 + 2 * 6) / 60) * 100)
  })

  it('a player whose every innings lacks ball data gets n/a, not a wrong number', () => {
    const c = counts({ batRuns: 80, batInnings: 2, batRunsUnballed: 80 })
    expect(getMetric('sr')!.value(c)).toBeNull()
    expect(getMetric('boundaryPct')!.value(c)).toBeNull()
    expect(battingAverages({ runs: 80, innings: 2, notOuts: 0, balls: 0, runsUnballed: 80 }).strikeRate).toBeNull()
  })

  it('is filled from the stored match rows by null (balls, fours or sixes missing)', () => {
    const c = aggregateFromMatchRows({
      games: 3, catches: 0, bowling: [],
      batting: [
        { played: true, status: 'out', runs: 30, balls: 25, fours: 3, sixes: 0 },
        { played: true, status: 'out', runs: 20, balls: null, fours: null, sixes: null },
        { played: true, status: 'not_out', runs: 10, balls: 12, fours: null, sixes: null },
        { played: true, status: 'did_not_bat', runs: 0, balls: null, fours: null, sixes: null },
      ],
    })
    expect(c).toMatchObject({ batRuns: 60, batBalls: 37, batRunsUnballed: 30 })
  })

  it('is filled from the parsed scorecard, which no longer coerces a missing ball count to a recorded zero', () => {
    const side = (id: string) => ({ id, name: id, isHomeTeam: id === 'ct', outcome: null, organisation: { id: id === 'ct' ? 'club' : 'opp', name: id } })
    const stat = (type: string, value: number) => ({ type, value })
    const raw = {
      id: 'g', status: 'FINAL', type: 'oneDay', grade: { id: 'x', name: 'G' }, round: null, schedule: [], coinToss: null, playingSurfaces: [],
      teams: [side('ct'), side('ot')],
      appearances: ['a', 'b'].map((id) => ({ id, firstName: id, lastName: 'x', teamId: 'ct', visible: true, roleType: 'Player', captainRole: null })),
      periods: [{
        id: 'p', name: 'FIRST_INNINGS', sequenceNo: 1, sharedStatistics: [],
        teams: [
          { id: 'ot', discipline: 'BOWLING', status: null, statistics: [], appearances: [], fallOfWickets: null },
          { id: 'ct', discipline: 'BATTING', status: null, statistics: [stat('TOTAL_SCORE', 70), stat('TOTAL_OUTS', 1), stat('TOTAL_OVERS', 10)], fallOfWickets: null, appearances: [
            { id: 'a', displayOrder: 1, status: 'OUT', statistics: [stat('TOTAL_RUNS', 50), stat('BALLS_FACED', 40), stat('FOURS', 5), stat('SIXES', 1)] },
            { id: 'b', displayOrder: 2, status: 'NOT_OUT', statistics: [stat('TOTAL_RUNS', 20)] },
          ] },
        ],
      }],
    } as unknown as RawGameSummary
    const stats = aggregatePlayers([mapScorecard(raw, 'club', false)], 'ct')
    const byKey = new Map(stats.map((s) => [s.key, countsFromStats(s)]))
    expect(byKey.get('a|x')).toMatchObject({ batRuns: 50, batBalls: 40, batRunsUnballed: 0 })
    expect(byKey.get('b|x')).toMatchObject({ batRuns: 20, batBalls: 0, batRunsUnballed: 20 })
  })
})
