import { describe, it, expect } from 'vitest'
import { battingView, bowlingView, careerTotals, isActive, seasonYears, splitPlayers, teamLabel, yearsLabel, initials } from '@/lib/players/view'
import { EMPTY_COUNTS } from '@/lib/players/season-math'
import type { Player } from '@/lib/domain'

const base: Player = {
  id: 1, slug: 'jo-smith', firstName: 'Jo', lastName: 'Smith', photoUrl: '', bio: '', source: 'playhq', manualYears: '',
  activeOverride: null, isActiveDerived: false, hidden: false, createdAt: new Date(), updatedAt: new Date(),
}
const s = (order: number, team = 'Lang Lang B Grade') => ({ seasonName: `Summer 20${25 - order}/${26 - order}`, seasonOrder: order, teamName: team })

describe('isActive', () => {
  it('override wins over derived', () => {
    expect(isActive({ activeOverride: null, isActiveDerived: true })).toBe(true)
    expect(isActive({ activeOverride: 'past', isActiveDerived: true })).toBe(false)
    expect(isActive({ activeOverride: 'active', isActiveDerived: false })).toBe(true)
  })
})

describe('labels', () => {
  it('season years and team label', () => {
    expect(seasonYears('Summer 2025/26')).toBe('2025/26')
    expect(seasonYears('Winter 2026')).toBe('2026')
    expect(teamLabel('Lang Lang B Grade')).toBe('B Grade')
    expect(teamLabel('One Day')).toBe('One Day')
  })
  it('years label spans oldest to newest season; manual uses manualYears', () => {
    expect(yearsLabel(base, [s(0), s(3), s(1)])).toBe('2022/23 – 2025/26')
    expect(yearsLabel(base, [s(2)])).toBe('2023/24')
    expect(yearsLabel({ source: 'manual', manualYears: '1978–1992' }, [])).toBe('1978–1992')
    expect(yearsLabel(base, [])).toBe('')
  })
  it('initials', () => {
    expect(initials('Jo Smith')).toBe('JS')
    expect(initials('Cher')).toBe('C')
  })
})

describe('splitPlayers', () => {
  it('drops hidden, splits by active, sorts active by name and past by most recent then name, manual last', () => {
    const { active, past } = splitPlayers([
      { player: { ...base, id: 1, firstName: 'Zed', isActiveDerived: true }, seasons: [s(0)] },
      { player: { ...base, id: 2, firstName: 'Amy', isActiveDerived: true }, seasons: [s(1)] },
      { player: { ...base, id: 3, firstName: 'Old', slug: 'old' }, seasons: [s(5)] },
      { player: { ...base, id: 4, firstName: 'Mid', slug: 'mid' }, seasons: [s(2)] },
      { player: { ...base, id: 5, firstName: 'Legend', source: 'manual', manualYears: '1980' }, seasons: [] },
      { player: { ...base, id: 6, firstName: 'Ghost', hidden: true, isActiveDerived: true }, seasons: [s(0)] },
    ])
    expect(active.map((c) => c.name)).toEqual(['Amy Smith', 'Zed Smith'])
    expect(past.map((c) => c.name)).toEqual(['Mid Smith', 'Old Smith', 'Legend Smith'])
    expect(active[0].grades).toEqual(['B Grade'])
  })
})

describe('career + views', () => {
  it('sums seasons and formats', () => {
    const c = careerTotals([
      { ...EMPTY_COUNTS, games: 5, batInnings: 5, batNotOuts: 1, batRuns: 100, batBalls: 200, batHighScore: 45, batHighScoreNotOut: true },
      { ...EMPTY_COUNTS, games: 3, batInnings: 3, batRuns: 20, batBalls: 40, batHighScore: 12, bowlBalls: 81, bowlRuns: 27, bowlWickets: 3, bowlBestWickets: 2, bowlBestRuns: 10 },
    ])
    expect(c.games).toBe(8)
    expect(battingView(c)).toMatchObject({ runs: 120, highScore: '45*', average: '17.14', strikeRate: '50.0' })
    expect(bowlingView(c)).toMatchObject({ overs: '13.3', wickets: 3, best: '2/10', average: '9.00', economy: '2.00' })
  })
  it('dashes when there is nothing to show', () => {
    expect(battingView(EMPTY_COUNTS)).toMatchObject({ highScore: '–', average: '–', strikeRate: '–' })
    expect(bowlingView(EMPTY_COUNTS)).toMatchObject({ best: '–', average: '–', economy: '–' })
    expect(careerTotals([])).toEqual(EMPTY_COUNTS)
  })
})
