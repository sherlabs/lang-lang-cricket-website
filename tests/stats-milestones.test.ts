import { describe, expect, it } from 'vitest'
import { mergeBySeason } from '@/lib/stats/aggregate'
import { DEFAULT_APPROACH_WINDOW, DEFAULT_MILESTONE_THRESHOLDS } from '@/lib/site-settings-core'
import {
  buildMilestoneBoard, describeAchieved, describeApproaching, hasEarlierHistory, milestoneName, milestonesFor, topAchieved, unitOf, type MilestonePlayer,
} from '@/lib/stats/milestones'
import { row } from './stats-helpers'

const config = { thresholds: DEFAULT_MILESTONE_THRESHOLDS, window: DEFAULT_APPROACH_WINDOW }
const WINDOW = 'Summer 2023/24'
const rowsFor = (id: number, games: [number, number, number], runs: [number, number, number] = [0, 0, 0]) => [
  row({ playerId: id, seasonName: 'Summer 2025/26', seasonOrder: 1, counts: { games: games[0], batRuns: runs[0] } }),
  row({ playerId: id, seasonName: 'Summer 2024/25', seasonOrder: 2, counts: { games: games[1], batRuns: runs[1] } }),
  row({ playerId: id, seasonName: WINDOW, seasonOrder: 3, counts: { games: games[2], batRuns: runs[2] } }),
]
const base = { windowStart: WINDOW, config }

describe('milestonesFor', () => {
  it('99 games is approaching 100 with 1 to go', () => {
    const m = milestonesFor({ seasons: mergeBySeason(rowsFor(1, [33, 33, 33])), ...base })
    expect(m.approaching).toContainEqual({ key: 'games', threshold: 100, current: 99, remaining: 1 })
  })
  it('names the season in which a threshold was crossed (cumulative, oldest first)', () => {
    const m = milestonesFor({ seasons: mergeBySeason(rowsFor(1, [10, 10, 10], [800, 700, 517])), ...base })
    const runs = m.achieved.filter((a) => a.key === 'runs')
    expect(runs.map((a) => [a.threshold, a.reachedIn])).toEqual([[500, '2023/24'], [1000, '2024/25'], [2000, '2025/26']])
    expect(topAchieved(m.achieved).find((a) => a.key === 'runs')!.threshold).toBe(2000)
  })
  it('does not list a milestone before its threshold', () => {
    const m = milestonesFor({ seasons: mergeBySeason(rowsFor(1, [10, 10, 9])), ...base })
    expect(m.achieved.some((a) => a.key === 'games' && a.threshold === 50)).toBe(false)
  })
  it('window edge: approaching ends once the remaining count exceeds the window', () => {
    const has = (g: [number, number, number]) => milestonesFor({ seasons: mergeBySeason(rowsFor(1, g)), ...base }).approaching.some((a) => a.key === 'games')
    expect(has([30, 33, 32])).toBe(true) // 95: 5 to go, inside the window of 5
    expect(has([30, 33, 31])).toBe(false) // 94: 6 to go
  })
  it('veteran with earlier history and no baseline is not approaching, and achieved reads "since"', () => {
    const m = milestonesFor({ seasons: mergeBySeason(rowsFor(1, [20, 20, 19], [600, 0, 0])), manualYears: '1998–2024', ...base })
    expect(m.partial).toBe(true)
    expect(m.approaching).toEqual([])
    const a = m.achieved.find((x) => x.key === 'runs' && x.threshold === 500)!
    expect(a).toMatchObject({ reachedIn: null, sinceWindow: true })
    expect(describeAchieved(a, '2023/24')).toBe('500 runs, since 2023/24')
  })
  it('a recorded baseline is added to the totals and unlocks approaching', () => {
    const m = milestonesFor({
      seasons: mergeBySeason(rowsFor(1, [10, 10, 10])), manualYears: '1998–2024', baseline: { games: 65, runs: 0, wickets: 0, catches: 0 }, ...base,
    })
    expect(m.partial).toBe(false)
    expect(m.totals.games).toBe(95)
    expect(m.approaching).toContainEqual({ key: 'games', threshold: 100, current: 95, remaining: 5 })
    // 50 was crossed before the window, so there is no season to report; 100 is not yet reached
    expect(m.achieved.find((a) => a.key === 'games' && a.threshold === 50)).toMatchObject({ reachedIn: null, sinceWindow: false })
  })
  it('baseline: crossing inside the window reports the season', () => {
    const m = milestonesFor({
      seasons: mergeBySeason(rowsFor(1, [10, 10, 10])), baseline: { games: 45, runs: 0, wickets: 0, catches: 0 }, ...base,
    })
    // 45 + 10 = 55 after 2023/24 -> 50 reached in 2023/24
    expect(m.achieved.find((a) => a.key === 'games' && a.threshold === 50)!.reachedIn).toBe('2023/24')
  })
  it('manual years starting inside the window do not count as earlier history', () => {
    expect(hasEarlierHistory('2023–', WINDOW)).toBe(false)
    expect(hasEarlierHistory('', WINDOW)).toBe(false)
    expect(hasEarlierHistory('1998–2024', WINDOW)).toBe(true)
    expect(hasEarlierHistory('1998–2024', null)).toBe(false)
  })
})

describe('text helpers', () => {
  it('pluralises', () => {
    expect(unitOf('games', 1)).toBe('game')
    expect(unitOf('catches', 2)).toBe('catches')
    expect(milestoneName('runs', 1000)).toBe('1,000 runs')
    expect(describeApproaching({ key: 'games', threshold: 100, remaining: 1 })).toBe('1 game to go for 100 games')
  })
})

describe('buildMilestoneBoard', () => {
  const players: MilestonePlayer[] = [
    { id: 1, name: 'Neil', slug: 'neil', active: true, manualYears: '', baseline: { games: 0, runs: 0, wickets: 0, catches: 0 } },
    { id: 2, name: 'Past Pete', slug: 'pete', active: false, manualYears: '', baseline: { games: 0, runs: 0, wickets: 0, catches: 0 } },
    { id: 3, name: 'Vic', slug: 'vic', active: true, manualYears: '1998–2024', baseline: { games: 0, runs: 0, wickets: 0, catches: 0 } },
  ]
  const rows = [...rowsFor(1, [33, 33, 33]), ...rowsFor(2, [33, 33, 33]), ...rowsFor(3, [33, 33, 33])]
  const run = (onlyActive: boolean) =>
    buildMilestoneBoard({ players, rows, windowStart: WINDOW, currentSeason: 'Summer 2025/26', config, onlyActive })

  it('public board: active only and veterans excluded from approaching', () => {
    const b = run(true)
    expect(b.approaching.map((a) => a.slug)).toEqual(['neil'])
  })
  it('admin board includes inactive players', () => {
    expect(run(false).approaching.map((a) => a.slug).sort()).toEqual(['neil', 'pete'])
  })
  it('lists milestones crossed in the current season', () => {
    const b = buildMilestoneBoard({
      players: [players[0]], rows: rowsFor(1, [30, 20, 0], [0, 0, 0]), windowStart: WINDOW, currentSeason: 'Summer 2025/26', config, onlyActive: true,
    })
    // 20 + 0 = 20 before 2025/26; +30 -> 50 reached in 2025/26
    expect(b.achievedNow).toContainEqual(expect.objectContaining({ key: 'games', threshold: 50, reachedIn: '2025/26' }))
  })
})
