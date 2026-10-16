import { describe, expect, it } from 'vitest'
import { gameRow, monthLabel, searchTextOf } from '@/lib/social/game-rows'

describe('gameRow', () => {
  const base = { date: '2025-10-11', grade: 'B Grade', round: 'Round 14', opposition: 'Hilltop CC', letter: 'W', clubName: 'Test CC', clubScore: '5/172', oppScore: '9/168' }
  it('builds the title, opposition, badge and score line', () => {
    const r = gameRow(base, 'en-AU')
    expect(r).toMatchObject({ kind: 'game', date: '2025-10-11', title: 'B Grade, Round 14', subtitle: 'v Hilltop CC', result: { label: 'Won', tone: 'ok' }, score: 'Test CC 5/172 v Hilltop CC 9/168', group: 'Round 14' })
  })
  it('badges every outcome and leaves the badge off for an unknown one', () => {
    expect(['L', 'T', 'D', 'N'].map((l) => gameRow({ ...base, letter: l }, 'en-AU').result?.label)).toEqual(['Lost', 'Tied', 'Draw', 'No result'])
    expect(gameRow({ ...base, letter: '-' }, 'en-AU').result).toBeUndefined()
  })
  it('groups by month when there is no round, and drops the score when a side has none', () => {
    const r = gameRow({ ...base, round: null, clubScore: '', letter: undefined }, 'en-AU')
    expect(r.group).toBe('October 2025')
    expect(r.score).toBeUndefined()
    expect(r.title).toBe('B Grade')
  })
  it('handles a missing date', () => {
    expect(gameRow({ ...base, date: null, round: '' }, 'en-AU').group).toBe('No date')
    expect(monthLabel('garbage', 'en-AU')).toBe('No date')
  })
  it('searches by opposition, grade, round, date digits, date words and result', () => {
    const r = gameRow(base, 'en-AU')
    const hay = searchTextOf(r, 'label', 'en-AU')
    for (const q of ['hilltop', 'b grade', 'round 14', '2025-10-11', 'saturday', 'october', 'won']) expect(hay).toContain(q)
  })
})
