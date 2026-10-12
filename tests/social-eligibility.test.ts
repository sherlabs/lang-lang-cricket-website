import { describe, expect, it } from 'vitest'
import { ageOn, isJunior, isSocialEligible, juniorCategoryIds } from '@/lib/social/eligibility'

describe('social eligibility', () => {
  const day = '2026-10-17'
  it('works out age on the game date, with the birthday boundary at 18', () => {
    expect(ageOn('2008-10-17', day)).toBe(18)
    expect(ageOn('2008-10-18', day)).toBe(17)
    expect(ageOn('2008-10-16', day)).toBe(18)
    expect(ageOn('nonsense', day)).toBeNull()
  })

  it('an adult with no flags is eligible', () => {
    expect(isSocialEligible({}, day)).toBe(true)
    expect(isSocialEligible({ dateOfBirth: '1990-01-01' }, day)).toBe(true)
  })

  it('a junior by flag, by date of birth or by grade category needs the opt-in', () => {
    for (const p of [{ isJunior: true }, { dateOfBirth: '2012-05-05' }, { juniorCategory: true }, { dateOfBirth: '2008-10-18' }]) {
      expect(isJunior(p, day)).toBe(true)
      expect(isSocialEligible(p, day)).toBe(false)
      expect(isSocialEligible({ ...p, socialOptIn: true }, day)).toBe(true)
    }
  })

  it('turns 18 on the day: eligible without the opt-in from then on', () => {
    expect(isSocialEligible({ dateOfBirth: '2008-10-17' }, day)).toBe(true)
    expect(isSocialEligible({ dateOfBirth: '2008-10-17' }, '2026-10-16')).toBe(false)
  })

  it('fails closed: unknown players and unreadable dates of birth are not eligible', () => {
    expect(isSocialEligible(null, day)).toBe(false)
    expect(isSocialEligible(undefined, day)).toBe(false)
    expect(isSocialEligible({ dateOfBirth: '??' }, day)).toBe(false)
    expect(isSocialEligible({ socialOptIn: true, dateOfBirth: '??' }, day)).toBe(true)
  })

  it('an opt-in on an adult changes nothing', () => {
    expect(isSocialEligible({ socialOptIn: true }, day)).toBe(true)
  })

  it('finds players whose latest season was junior', () => {
    const rows = [
      { playerId: 1, seasonOrder: 0, grade: 'junior' },
      { playerId: 1, seasonOrder: 1, grade: 'junior' },
      { playerId: 2, seasonOrder: 0, grade: 'senior' },
      { playerId: 2, seasonOrder: 3, grade: 'junior' },
      { playerId: 3, seasonOrder: 2, grade: 'junior' },
    ]
    expect([...juniorCategoryIds(rows, (r) => r.grade === 'junior')].sort()).toEqual([1, 3])
  })
})
