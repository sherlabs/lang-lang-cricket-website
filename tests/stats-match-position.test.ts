import { describe, expect, it } from 'vitest'
import { POSITION_BUCKETS, positionSummary } from '@/lib/stats/match/position'
import type { BatFact } from '@/lib/stats/match/types'

const f = (pos: number, runs: number, status: BatFact['status'] = 'out'): BatFact => ({ m: 1, seq: 1, player: 1, pos, status, runs, balls: 10, fours: 0, sixes: 0, dismissal: status === 'out' ? 'bowled' : null })
const min = { positionInnings: 5 }

describe('positionSummary', () => {
  it('buckets are the constants in the spec', () => {
    expect(POSITION_BUCKETS.map((b) => [b.from, b.to])).toEqual([[1, 2], [3, 5], [6, 7], [8, 11]])
  })
  it('computes bucket lines and shows an average only with enough innings', () => {
    const bat = [...[10, 20, 30, 40, 50].map((r, i) => f(1 + (i % 2), r)), f(3, 100, 'not_out'), f(4, 7)]
    const s = positionSummary(bat, min)
    const opener = s.lines[0], middle = s.lines[1]
    expect(opener).toMatchObject({ innings: 5, runs: 150, outs: 5, fifties: 1 })
    expect(opener.average).toBe(30)
    expect(middle).toMatchObject({ innings: 2, runs: 107, outs: 1, highScore: 100, highScoreNotOut: true })
    expect(middle.average).toBeNull()
  })
  it('gives the most common position (a tie goes to the lower number) and the average position', () => {
    const s = positionSummary([f(3, 1), f(3, 1), f(2, 1), f(2, 1), f(9, 1)], min)
    expect(s.mostCommon).toBe(2)
    expect(s.averagePosition).toBeCloseTo(19 / 5)
  })
  it('excludes position 0 and counts it, and puts a position above 11 in the tail', () => {
    const s = positionSummary([f(0, 50), f(12, 5)], min)
    expect(s.excluded).toBe(1)
    expect(s.lines[3].innings).toBe(1)
    expect(s.lines.reduce((a, l) => a + l.runs, 0)).toBe(5)
  })
  it('has no data for an empty list', () => {
    expect(positionSummary([], min)).toMatchObject({ mostCommon: null, averagePosition: null, excluded: 0 })
  })
})
