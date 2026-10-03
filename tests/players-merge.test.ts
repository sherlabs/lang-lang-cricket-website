import { describe, it, expect } from 'vitest'
import { planMerge } from '@/lib/players/merge'
import { EMPTY_COUNTS } from '@/lib/players/season-math'
import type { PlayerSeason } from '@/lib/domain'

const row = (id: number, playerId: number, teamId: string, o: Partial<PlayerSeason> = {}): PlayerSeason => ({
  ...EMPTY_COUNTS, id, playerId, teamId, teamName: `Lang Lang ${teamId}`, seasonName: 'Summer 2025/26', seasonOrder: 1, gradeName: null, ...o,
})
const p = (o = {}) => ({ photo: null as number | null, bio: '', isActiveDerived: false, ...o })

describe('planMerge', () => {
  it('moves rows for teams the target never played, combines shared teams', () => {
    const plan = planMerge(p(), p(), [row(1, 10, 'B', { games: 2, batRuns: 20 }), row(2, 10, 'D')], [row(3, 20, 'B', { games: 3, batRuns: 5 })])
    expect(plan.moveSeasonIds).toEqual([2])
    expect(plan.combine).toEqual([{ targetRowId: 3, sourceRowId: 1, counts: expect.objectContaining({ games: 5, batRuns: 25 }) }])
  })
  it('carries photo and bio only when the target lacks them; active is OR', () => {
    expect(planMerge(p({ photo: 7, bio: 'x', isActiveDerived: true }), p(), [], []).targetPatch).toEqual({ photo: 7, bio: 'x', isActiveDerived: true })
    expect(planMerge(p({ photo: 7 }), p({ photo: 8 }), [], []).targetPatch).toEqual({ isActiveDerived: false })
  })
})
