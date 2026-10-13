import { describe, expect, it } from 'vitest'
import { checkSquad, countTransfers, outOfGame, type PoolPlayer } from '../lib/fantasy/squad'

const rules = { squadSize: 3, salaryCapTenths: 100, transfersPerRound: 1 }
const pool = new Map<number, PoolPlayer>([
  [1, { priceTenths: 40, inGame: true }], [2, { priceTenths: 30, inGame: true }], [3, { priceTenths: 30, inGame: true }],
  [4, { priceTenths: 31, inGame: true }], [5, { priceTenths: 10, inGame: true }], [6, { priceTenths: 10, inGame: false }], [7, { priceTenths: 10, inGame: true }],
])
const now = new Date('2025-10-10T00:00:00Z')
const lock = new Date('2025-10-11T00:00:00Z')
const run = (over: Partial<Parameters<typeof checkSquad>[0]> = {}) => checkSquad({ picks: [1, 2, 3], captain: 1, pool, rules, previous: null, now, lock, ...over })

describe('checkSquad', () => {
  it('accepts a squad at exactly the cap and returns the spend', () => expect(run()).toEqual({ ok: true, spentTenths: 100, transfersUsed: 0 }))
  it('refuses one tenth over the cap and says by how much', () => {
    const r = run({ picks: [1, 2, 4] })
    expect(r).toMatchObject({ ok: false, code: 'cap' })
    expect((r as { message: string }).message).toContain('over the cap by 0.1')
  })
  it('refuses the wrong size, duplicates and unknown players', () => {
    expect(run({ picks: [1, 2] })).toMatchObject({ code: 'size' })
    expect(run({ picks: [1, 1, 2] })).toMatchObject({ code: 'duplicate' })
    expect(run({ picks: [1, 2, 99] })).toMatchObject({ code: 'unknown' })
    expect(run({ picks: [1, 2, Number.NaN] })).toMatchObject({ code: 'unknown' })
  })
  it('refuses a player who is not in the game', () => expect(run({ picks: [1, 2, 6] })).toMatchObject({ code: 'ineligible' }))
  it('needs a captain who is in the squad and in the game', () => {
    expect(run({ captain: null })).toMatchObject({ code: 'captain' })
    expect(run({ captain: 5 })).toMatchObject({ code: 'captain' })
  })
  it('refuses a locked round, including at the exact lock instant', () => {
    expect(run({ now: lock })).toMatchObject({ code: 'locked' })
    expect(run({ now: new Date(lock.getTime() - 1) }).ok).toBe(true)
  })
  it('the first squad has no transfer limit; later squads are limited', () => {
    expect(run({ picks: [5, 7, 1], previous: null, rules: { ...rules, transfersPerRound: 1 } }).ok).toBe(true)
    expect(run({ picks: [1, 2, 5], previous: [1, 2, 3] }).ok).toBe(true)
    expect(run({ picks: [1, 5, 7], previous: [1, 2, 3] })).toMatchObject({ ok: false, code: 'transfers' })
  })
  it('zero transfers per round means unlimited', () => expect(run({ picks: [5, 7, 1], previous: [2, 3, 4], rules: { ...rules, transfersPerRound: 0 } }).ok).toBe(true))
  it('replacing a player who is no longer in the game is not a transfer', () => {
    // Previous: 1, 2, 6 (6 is gone). Swap 6 for 5: free. Also swap 2 for 7: one real transfer, within the cap of 1.
    expect(countTransfers([1, 2, 6], [1, 2, 5], pool)).toBe(0)
    expect(countTransfers([1, 2, 6], [1, 7, 5], pool)).toBe(1)
    expect(run({ picks: [1, 2, 5], previous: [1, 2, 6] })).toEqual({ ok: true, spentTenths: 80, transfersUsed: 0 })
  })
  it('keeping an unavailable player makes the squad invalid, and so does an unavailable captain', () => {
    expect(run({ picks: [1, 2, 6], previous: [1, 2, 6] })).toMatchObject({ code: 'ineligible' })
    expect(outOfGame([1, 2, 6], pool)).toEqual([6])
  })
})
