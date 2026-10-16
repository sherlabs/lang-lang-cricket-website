import { describe, expect, it } from 'vitest'
import type { PlayerSeason } from '@/lib/domain'
import { buildProfileExtras, rankBadgesFor, splitJuniorSeasons, toStatRow } from '@/lib/players/profile-extras'
import { careerTotals } from '@/lib/players/view'
import { DEFAULT_STATS_SETTINGS } from '@/lib/site-settings-core'
import { row } from './stats-helpers'
import { EMPTY_COUNTS } from '@/lib/players/season-math'

const ps = (o: Partial<PlayerSeason> & { seasonName: string; seasonOrder: number }): PlayerSeason => ({
  id: 1, playerId: 1, teamId: 't', teamName: 'Lang Lang A Grade', gradeName: 'A Grade', ...EMPTY_COUNTS, ...o,
})

const seasons: PlayerSeason[] = [
  ps({ id: 1, seasonName: 'Summer 2025/26', seasonOrder: 1, games: 16, batInnings: 15, batRuns: 700, batBalls: 800, batHighScore: 104 }),
  ps({ id: 2, seasonName: 'Summer 2024/25', seasonOrder: 2, games: 15, batInnings: 14, batRuns: 350, batBalls: 500, bowlBalls: 120, bowlWickets: 10, bowlBestWickets: 5, bowlBestRuns: 20 }),
  ps({ id: 3, seasonName: 'Summer 2023/24', seasonOrder: 3, games: 12, batInnings: 8, batRuns: 100, teamName: 'Lang Lang Under 16', gradeName: 'Under 16' }),
]
const rules = DEFAULT_STATS_SETTINGS.gradeRules

describe('splitJuniorSeasons', () => {
  it('hides junior rows by default and reports that some exist', () => {
    const r = splitJuniorSeasons(seasons, rules, false)
    expect(r.hasJuniorRows).toBe(true)
    expect(r.seasons.map((s) => s.id)).toEqual([1, 2])
  })
  it('includes them on request', () => {
    expect(splitJuniorSeasons(seasons, rules, true).seasons).toHaveLength(3)
  })
  it('reports no junior rows for a senior-only player', () => {
    expect(splitJuniorSeasons(seasons.slice(0, 2), rules, false).hasJuniorRows).toBe(false)
  })
})

describe('buildProfileExtras', () => {
  const shown = splitJuniorSeasons(seasons, rules, false).seasons
  const league = shown.map(toStatRow)
  const build = (s = shown) =>
    buildProfileExtras({ playerId: 1, seasons: s, career: s.length ? careerTotals(s) : null, leagueRows: league, settings: DEFAULT_STATS_SETTINGS, manualYears: '' })

  it('derives centurion and five-wicket badges from single values only', () => {
    const e = build()
    expect(e.centurion).toBe(true)
    expect(e.fiveWicketHaul).toBe(true)
  })
  it('no centurion when the high score is under 100', () => {
    const low = shown.map((s) => ({ ...s, batHighScore: 90 }))
    expect(build(low).centurion).toBe(false)
  })
  it('a player with no bowling gets no wickets series and hasBowling false', () => {
    const noBowl = shown.map((s) => ({ ...s, bowlBalls: 0, bowlWickets: 0, bowlBestWickets: 0, bowlBestRuns: 0 }))
    const e = build(noBowl)
    expect(e.hasBowling).toBe(false)
    expect(e.series.some((s) => s.key === 'wickets')).toBe(false)
    expect(e.fiveWicketHaul).toBe(false)
  })
  it('a single-season player draws no charts', () => {
    expect(build(shown.slice(0, 1)).series).toEqual([])
  })
  it('does not count junior rows toward milestones', () => {
    const withJunior = buildProfileExtras({
      playerId: 1, seasons, career: careerTotals(seasons), leagueRows: league, settings: DEFAULT_STATS_SETTINGS, manualYears: '',
    })
    expect(withJunior.milestones.totals.games).toBe(31)
  })
})

describe('rankBadgesFor (same code path as /stats)', () => {
  const rows = [
    row({ playerId: 1, counts: { games: 10, batInnings: 10, batRuns: 900 } }),
    row({ playerId: 2, counts: { games: 10, batInnings: 10, batRuns: 800 } }),
    row({ playerId: 3, counts: { games: 10, batInnings: 10, batRuns: 700 } }),
    row({ playerId: 4, counts: { games: 10, batInnings: 10, batRuns: 600 } }),
  ]
  it('returns top-three places only', () => {
    expect(rankBadgesFor(1, rows, DEFAULT_STATS_SETTINGS).find((r) => r.key === 'runs')).toMatchObject({ rank: 1, badge: 'gold', display: '900' })
    expect(rankBadgesFor(3, rows, DEFAULT_STATS_SETTINGS).find((r) => r.key === 'runs')).toMatchObject({ rank: 3, badge: 'bronze' })
    expect(rankBadgesFor(4, rows, DEFAULT_STATS_SETTINGS).find((r) => r.key === 'runs')).toBeUndefined()
  })
  it('does not rank a rate stat the player does not qualify for', () => {
    const small = [row({ playerId: 9, counts: { games: 2, batInnings: 2, batRuns: 200, batBalls: 50 } })]
    expect(rankBadgesFor(9, small, DEFAULT_STATS_SETTINGS).some((r) => r.key === 'avg' || r.key === 'sr')).toBe(false)
  })
})
