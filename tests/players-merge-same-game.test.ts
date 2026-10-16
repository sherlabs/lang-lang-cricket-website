import { describe, expect, it } from 'vitest'
import { pairId, pairsSharingMatches, sameGameMessage, sharedMatches } from '@/lib/players/same-game'

const rows = [
  { match: 1, player: 10 }, { match: 1, player: 20 }, { match: 2, player: 10 }, { match: 3, player: 20 }, { match: 3, player: 30 }, { match: 4, player: 10 }, { match: 4, player: 20 },
]

describe('same-game rule', () => {
  it('finds the games two players share', () => {
    expect(sharedMatches(rows, 10, 20)).toEqual([1, 4])
    expect(sharedMatches(rows, 10, 30)).toEqual([])
    expect(sharedMatches(rows, 20, 30)).toEqual([3])
  })

  it('marks only the pairs that share a game', () => {
    const hit = pairsSharingMatches(rows, [[10, 20], [10, 30], [30, 20]])
    expect([...hit].sort()).toEqual([pairId(10, 20), pairId(20, 30)].sort())
    expect(pairId(2, 1)).toBe('1|2')
  })

  it('the refusal names the shared games', () => {
    const msg = sameGameMessage('Jon Smith', 'John Smith', [{ date: '2025-11-02', opponent: 'Demo Rovers' }, { date: '2025-11-09', opponent: null }])
    expect(msg).toContain('Jon Smith and John Smith both played in 2025-11-02 against Demo Rovers; 2025-11-09')
    expect(msg).toContain('confirm twice')
    expect(sameGameMessage('A', 'B', Array.from({ length: 5 }, () => ({ date: 'd', opponent: null }))) ).toContain('and 2 more')
  })
})
