import { describe, expect, it } from 'vitest'
import { careerOf, mergeBySeason } from '@/lib/stats/aggregate'
import { DEFAULT_QUALIFICATION } from '@/lib/stats/qualify'
import { buildRecords } from '@/lib/stats/records'
import { currentSeasonName } from '@/lib/stats/season-window'
import { row } from './stats-helpers'

const rows = [
  row({ playerId: 1, seasonName: 'Summer 2024/25', seasonOrder: 1, counts: { games: 15, batRuns: 500, batInnings: 15, batHighScore: 120, batHighScoreNotOut: true } }),
  row({ playerId: 1, seasonName: 'Summer 2024/25', seasonOrder: 1, teamId: 'b', gradeName: 'B Grade', counts: { games: 3, batRuns: 40, batInnings: 3 } }),
  row({ playerId: 1, seasonName: 'Summer 2023/24', seasonOrder: 2, counts: { games: 14, batRuns: 250, batInnings: 14 } }),
  row({ playerId: 2, seasonName: 'Summer 2024/25', seasonOrder: 1, counts: { games: 15, batRuns: 540, batInnings: 15 } }),
  row({ playerId: 3, seasonName: 'Summer 2024/25', seasonOrder: 1, counts: { games: 15, batRuns: 540, batInnings: 15 } }),
]
const build = (r = rows) => buildRecords({ career: careerOf(r), seasons: mergeBySeason(r), currentSeason: currentSeasonName(r), qual: DEFAULT_QUALIFICATION })

describe('buildRecords', () => {
  it('merges multi-team seasons before ranking single-season records', () => {
    const runs = build().season.find((r) => r.key === 'runs')!
    // player 1: 500 + 40 = 540 in one season (two teams merged) ties players 2 and 3
    const top = runs.entries.filter((e) => e.rank === 1)
    expect(top.map((e) => e.playerId).sort()).toEqual([1, 2, 3])
    expect(top.every((e) => e.value === 540)).toBe(true)
    expect(runs.entries[3]).toMatchObject({ playerId: 1, value: 250, rank: 4 })
  })
  it('lists ties together and caps the list', () => {
    const many = Array.from({ length: 14 }, (_, i) => row({ playerId: 100 + i, counts: { games: 10, batRuns: 100, batInnings: 10 } }))
    const runs = build(many).season.find((r) => r.key === 'runs')!
    expect(runs.entries.length).toBe(10)
  })
  it('keeps career values and the since window', () => {
    const { since } = build()
    expect(since.find((r) => r.key === 'runs')!.entries[0].value).toBe(790)
    expect(since.find((r) => r.key === 'hs')!.entries[0].display).toBe('120*')
    expect(since.find((r) => r.key === 'seasons')!.entries[0]).toMatchObject({ playerId: 1, value: 2 })
  })
  it('flags NEW only for a top record in the data-defined current season', () => {
    // newest season group (order 0) has no rows: current season is order 1
    const runs = build().season.find((r) => r.key === 'runs')!
    expect(runs.entries[0].isNew).toBe(true)
    const older = rows.filter((r) => r.seasonOrder !== 1)
    const olderRuns = buildRecords({ career: careerOf(older), seasons: mergeBySeason(older), currentSeason: 'Summer 2025/26', qual: DEFAULT_QUALIFICATION }).season.find((r) => r.key === 'runs')!
    expect(olderRuns.entries[0].isNew).toBe(false)
  })
  it('applies qualification to averages', () => {
    const avg = build().season.find((r) => r.key === 'avg')!
    expect(avg.entries.length).toBeGreaterThan(0)
    const tiny = build([row({ counts: { games: 2, batRuns: 90, batInnings: 2 } })]).season.find((r) => r.key === 'avg')!
    expect(tiny.entries).toEqual([])
  })
})
