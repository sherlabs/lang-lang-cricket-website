import { describe, expect, it } from 'vitest'
import { cheapestSquadCost, DEFAULT_RULES, rulesProblem } from '@/lib/fantasy/rules'

describe('fantasy rules feasibility', () => {
  it('accepts the defaults', () => expect(rulesProblem(DEFAULT_RULES)).toBeNull())
  it('refuses a cap the cheapest squad cannot fit under', () => expect(rulesProblem({ ...DEFAULT_RULES, salaryCapTenths: 100 })).toMatch(/over the salary cap/))
  it('refuses a highest price below the lowest', () => expect(rulesProblem({ ...DEFAULT_RULES, minPriceTenths: 90, maxPriceTenths: 50 })).toMatch(/highest price/))
  it('adds up the cheapest squad', () => {
    expect(cheapestSquadCost([90, 40, 60, 50], 3)).toBe(150)
    expect(cheapestSquadCost([90, 40], 3)).toBeNull()
  })
})
