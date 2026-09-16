import { describe, it, expect } from 'vitest'
import ladder from '../fixtures/playhq/ladder-b-grade-2025-26.json'
import { mapLadder } from '@/lib/playhq/ladder'
import type { RawLadder } from '@/lib/playhq/types'

const LL_B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
describe('mapLadder', () => {
  const l = mapLadder(ladder as RawLadder, new Set([LL_B]))!
  it('maps headers and positions', () => {
    expect(l.gradeId).toBe('0d6f1f07-1753-45c6-bf2f-662a8ab9b9b4')
    expect(l.headers.map((h) => h.key).slice(0, 3)).toEqual(['played', 'competitionPoints', 'quotient'])
    expect(l.rows[0]).toMatchObject({ position: 1, teamName: 'PUTCC B Grade', isClub: false })
    expect(l.rows[0].values.competitionPoints).toBe(126)
    expect(l.rows.find((r) => r.teamId === LL_B)?.isClub).toBe(true)
  })
  it('null when empty', () => expect(mapLadder({ gradeId: 'g', ladders: [] }, new Set())).toBeNull())
})
