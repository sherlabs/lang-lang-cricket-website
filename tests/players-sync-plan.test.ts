import { describe, it, expect } from 'vitest'
import { buildSyncPlan, uniqueSlug, type TeamAggregate } from '@/lib/players/plan'
import type { PlayerSeasonStats } from '@/lib/playhq/types'

function stat(first: string, last: string, runs = 10, games = 1): PlayerSeasonStats {
  return {
    key: `${first}|${last}`.toLowerCase(), name: `${first} ${last}`, firstName: first, lastName: last, games,
    batting: { innings: games, notOuts: 0, runs, highScore: runs, highScoreNotOut: false, balls: runs * 2, fours: 0, sixes: 0, average: null, strikeRate: null },
    bowling: { balls: 0, overs: '0', maidens: 0, runs: 0, wickets: 0, bestWickets: 0, bestRuns: 0, average: null, economy: null },
    catches: 0,
  }
}
const agg = (order: number, teamId: string, stats: PlayerSeasonStats[]): TeamAggregate => ({
  seasonName: `Summer 20${25 - order}/${26 - order}`, seasonOrder: order, teamId, teamName: `Lang Lang ${teamId}`, gradeName: null, stats,
})

describe('uniqueSlug', () => {
  it('appends -2, -3 and records the slug as taken', () => {
    const taken = new Set(['jo-smith'])
    expect(uniqueSlug('jo-smith', taken)).toBe('jo-smith-2')
    expect(uniqueSlug('jo-smith', taken)).toBe('jo-smith-3')
    expect(taken.has('jo-smith-3')).toBe(true)
  })
})

describe('buildSyncPlan', () => {
  it('resolves existing aliases and creates new players once across seasons', () => {
    const plan = buildSyncPlan(
      [agg(0, 'B', [stat('Jo', 'Smith'), stat('Sam', 'Lee')]), agg(3, 'D', [stat('Sam', 'Lee')])],
      new Map([['jo|smith', 7]]),
      new Set(['jo-smith'])
    )
    expect(plan.newPlayers).toEqual([{ nameKey: 'sam|lee', slug: 'sam-lee', firstName: 'Sam', lastName: 'Lee' }])
    expect(plan.seasonRows).toHaveLength(3)
    expect(plan.seasonRows.find((r) => r.teamId === 'B' && r.playerId === 7)).toBeTruthy()
    expect(plan.seasonRows.filter((r) => r.newNameKey === 'sam|lee')).toHaveLength(2)
  })

  it('derives active from seasonOrder <= 1', () => {
    const plan = buildSyncPlan(
      [agg(1, 'B', [stat('Jo', 'Smith')]), agg(2, 'D', [stat('Old', 'Timer')])],
      new Map([['jo|smith', 7], ['old|timer', 8]]),
      new Set()
    )
    expect(plan.activePlayerIds).toEqual([7])
  })

  it('combines rows when two aliases of one player played for the same team', () => {
    const plan = buildSyncPlan(
      [agg(0, 'B', [stat('Jon', 'Smith', 20, 2), stat('Jonathan', 'Smith', 30, 3)])],
      new Map([['jon|smith', 7], ['jonathan|smith', 7]]),
      new Set()
    )
    expect(plan.seasonRows).toHaveLength(1)
    expect(plan.seasonRows[0]).toMatchObject({ playerId: 7, games: 5, batRuns: 50, batHighScore: 30 })
  })

  it('dedupes slugs for different new players with the same display name', () => {
    const plan = buildSyncPlan([agg(0, 'B', [stat('Jo', 'Smith')]), agg(0, 'C', [stat('Jo', 'Smith ')])], new Map(), new Set())
    // same key after trim → one player
    expect(plan.newPlayers).toHaveLength(1)
  })
})
