import { describe, expect, it } from 'vitest'
import { canBePriced, isEligible, isInTheGame } from '../lib/fantasy/eligibility'

const base = { hidden: false, isJunior: false, inCurrentSquad: true, recentAppearances: 5, available: true }

describe('fantasy eligibility', () => {
  it('a visible senior in a squad is eligible', () => expect(isEligible(base)).toBe(true))
  it('a hidden player is not', () => expect(isEligible({ ...base, hidden: true })).toBe(false))
  it('a junior (isJunior) is never eligible, whatever their record', () => {
    expect(isEligible({ ...base, isJunior: true, recentAppearances: 99 })).toBe(false)
    expect(canBePriced({ ...base, isJunior: true })).toBe(false)
  })
  it('needs a current squad or a recent appearance', () => {
    expect(isEligible({ ...base, inCurrentSquad: false, recentAppearances: 0 })).toBe(false)
    expect(isEligible({ ...base, inCurrentSquad: false, recentAppearances: 1 })).toBe(true)
  })
  it('the committee can remove a player from the pool', () => {
    expect(isEligible({ ...base, available: false })).toBe(false)
    expect(canBePriced({ hidden: false, isJunior: false, inCurrentSquad: true, recentAppearances: 0 })).toBe(true)
  })
  it('isInTheGame refuses hidden, junior, removed and unknown players', () => {
    expect(isInTheGame({ hidden: false, isJunior: false, available: true })).toBe(true)
    expect(isInTheGame({ hidden: true, isJunior: false, available: true })).toBe(false)
    expect(isInTheGame({ hidden: false, isJunior: true, available: true })).toBe(false)
    expect(isInTheGame({ hidden: false, isJunior: false, available: false })).toBe(false)
    expect(isInTheGame(null)).toBe(false)
  })
})
