import { describe, expect, it } from 'vitest'
import { displayGrade, publicTeamName } from '@/lib/social/names'

describe('displayGrade', () => {
  it('removes a leading ordinal and dot only', () => {
    expect(displayGrade('2. Senior Men District')).toBe('Senior Men District')
    expect(displayGrade('12 . Seniors')).toBe('Seniors')
    expect(displayGrade('Under 14 Boys')).toBe('Under 14 Boys')
    expect(displayGrade('Division 2. North')).toBe('Division 2. North')
    expect(displayGrade(null)).toBe('')
  })
})

describe('publicTeamName', () => {
  const base = { clubName: 'Riverside CC', teamPrefix: 'Riverside Cricket Club' }
  it('turns the internal PlayHQ name into club + grade label', () => {
    expect(publicTeamName({ ...base, team: 'Riverside Cricket Club Premier 1', grade: '1. Premier' })).toBe('Riverside CC Premier')
    expect(publicTeamName({ ...base, team: 'riverside cricket club - Reserves', grade: '' })).toBe('Riverside CC Reserves')
  })
  it('uses club + grade when there is no team name', () => {
    expect(publicTeamName({ ...base, team: '', grade: 'B Grade' })).toBe('Riverside CC B Grade')
  })
  it('keeps a team name that is not the internal one', () => {
    expect(publicTeamName({ ...base, team: 'The Wanderers', grade: 'B Grade' })).toBe('The Wanderers')
  })
  it('does not match a prefix inside a longer word, and works with no prefix configured', () => {
    expect(publicTeamName({ ...base, team: 'Riverside Cricket Clubhouse XI', grade: 'A' })).toBe('Riverside Cricket Clubhouse XI')
    expect(publicTeamName({ clubName: 'Hilltop CC', teamPrefix: '', team: 'Some Team', grade: 'A' })).toBe('Some Team')
    expect(publicTeamName({ clubName: 'Hilltop CC', teamPrefix: '', team: '', grade: '3. Third' })).toBe('Hilltop CC Third')
  })
  it('works for a second club with different naming', () => {
    expect(publicTeamName({ clubName: 'Bay Rovers', teamPrefix: 'Bay Rovers Cricket Association', team: 'Bay Rovers Cricket Association Under 16', grade: 'Under 16' })).toBe('Bay Rovers Under 16')
  })
})
