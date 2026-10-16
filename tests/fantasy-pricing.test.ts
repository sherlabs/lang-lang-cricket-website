import { describe, expect, it } from 'vitest'
import { addMissing, computePrices, middlePrice } from '../lib/fantasy/pricing'

const P = { minPriceTenths: 40, maxPriceTenths: 140, priorGames: 3, minGamesForPrice: 3 }
const pool = [
  { id: 1, games: 20, points: 800 }, // 40 per game
  { id: 2, games: 20, points: 400 }, // 20
  { id: 3, games: 20, points: 100 }, // 5
  { id: 4, games: 18, points: 500 },
  { id: 5, games: 10, points: 150 },
]

describe('computePrices', () => {
  it('is deterministic, in range and rounded to 5 tenths', () => {
    const a = computePrices(pool, P)
    expect(computePrices([...pool].reverse(), P).sort((x, y) => x.id - y.id)).toEqual(a.sort((x, y) => x.id - y.id))
    for (const r of a) {
      expect(r.priceTenths % 5).toBe(0)
      expect(r.priceTenths).toBeGreaterThanOrEqual(40)
      expect(r.priceTenths).toBeLessThanOrEqual(140)
    }
  })
  it('the best points per game is the dearest, the worst the cheapest', () => {
    const by = new Map(computePrices(pool, P).map((r) => [r.id, r.priceTenths]))
    expect(by.get(1)).toBe(140)
    expect(by.get(3)).toBe(40)
    expect(by.get(1)!).toBeGreaterThan(by.get(2)!)
  })
  it('a debutant and a player with no data sit near the middle, never at an extreme', () => {
    const r = computePrices([...pool, { id: 6, games: 1, points: 24 }, { id: 7, games: 0, points: 0 }], P)
    const by = new Map(r.map((x) => [x.id, x]))
    expect(by.get(6)!.priceTenths).toBeLessThan(140)
    expect(by.get(6)!.priceTenths).toBeGreaterThan(40)
    // Shrinkage pulls one big game toward the average: a 90 point debut is priced below its raw 90 per game.
    const hot = computePrices([...pool, { id: 8, games: 1, points: 90 }], P).find((x) => x.id === 8)!
    expect(hot.basis.shrunk).toBeLessThan(90)
    expect(by.get(7)!.priceTenths).toBeGreaterThan(40)
    expect(by.get(7)!.priceTenths).toBeLessThan(140)
    expect(by.get(6)!.basis.thin).toBe(true)
    expect(by.get(1)!.basis.thin).toBe(false)
  })
  it('gives tied players the same price whatever their id, and is deterministic', () => {
    const input = [{ id: 9, games: 5, points: 50 }, { id: 3, games: 5, points: 50 }, { id: 5, games: 5, points: 5 }, { id: 6, games: 5, points: 500 }]
    const by = new Map(computePrices(input, P).map((x) => [x.id, x.priceTenths]))
    expect(by.get(3)).toBe(by.get(9))
    expect(computePrices(input, P)).toEqual(computePrices([...input].reverse(), P).sort((a, b) => input.findIndex((i) => i.id === a.id) - input.findIndex((i) => i.id === b.id)))
  })
  it('players with no data all sit at the same middle price, wherever their id falls', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, games: 10, points: 100 + i * 40 }))
    const none = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, games: 0, points: 0 }))
    const prices = new Set(computePrices([...none, ...data], P).filter((r) => r.id <= 20).map((r) => r.priceTenths))
    expect(prices.size).toBe(1)
  })
  it('a single player is priced in the middle', () => expect(computePrices([{ id: 1, games: 5, points: 100 }], P)[0].priceTenths).toBe(middlePrice(P)))
  it('an empty pool prices nobody and a flat pool is not extreme', () => {
    expect(computePrices([], P)).toEqual([])
    const flat = computePrices([{ id: 1, games: 5, points: 50 }, { id: 2, games: 5, points: 50 }], P)
    expect(flat.map((r) => r.priceTenths)).toEqual([middlePrice(P), middlePrice(P)])
  })
  it('stores the inputs behind every price', () => {
    const r = computePrices(pool, P)[0]
    expect(Object.keys(r.basis).sort()).toEqual(['games', 'points', 'rank', 'shrunk', 'thin'])
  })
  it('a junior left out of the input never moves anyone else (they are never an input)', () => {
    const without = computePrices(pool, P)
    const withJunior = computePrices([...pool, { id: 99, games: 30, points: 3000 }], P)
    // The caller drops juniors BEFORE pricing; including one would move others, which is exactly why eligibility is the single filter.
    expect(withJunior.find((r) => r.id === 1)!.priceTenths).toBeLessThanOrEqual(without.find((r) => r.id === 1)!.priceTenths)
    expect(without.some((r) => r.id === 99)).toBe(false)
  })
})

describe('addMissing', () => {
  it('prices only players without a row and never an existing one', () => {
    const rows = addMissing([...pool, { id: 8, games: 0, points: 0 }], new Set([1, 2, 3, 4, 5]), P)
    expect(rows.map((r) => r.id)).toEqual([8])
    expect(addMissing(pool, new Set(pool.map((p) => p.id)), P)).toEqual([])
  })
})
