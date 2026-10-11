/**
 * WP-0 (wave B spec section 2): a PlayHQ game with two periods sharing one `sequenceNo` used to fail the whole save. Innings are
 * now identified by the PlayHQ period id and carry our own ordinal 1..n. The fixture is anonymised (see the name guard below).
 */
import { describe, expect, it, vi } from 'vitest'
import dup from './fixtures/playhq/game-summary-duplicate-sequence.json'
import twoDay from './fixtures/playhq/game-summary-two-day.json'
import { upsertMatchBundle } from '@/lib/match-store/write'
import { assertUniqueInnings, isSkip, mapMatchBundle, MAPPER_VERSION, type MatchBundle } from '@/lib/playhq/match-rows'
import { isEmptyPeriod, mapScorecard } from '@/lib/playhq/scorecard'
import type { RawGameSummary } from '@/lib/playhq/types'

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const ctx = (raw: RawGameSummary) => ({
  clubOrgId: ORG, clubIds: new Set(raw.teams.filter((t) => t.organisation?.id === ORG).map((t) => t.id)),
  seasonName: 'S', seasonStartYear: 2025, competitionName: 'C', isJunior: false, fixture: null,
})
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const raw = (): RawGameSummary => clone(dup.data) as never
const map = (r: RawGameSummary): MatchBundle => {
  const b = mapMatchBundle(r, ctx(r))
  if (isSkip(b)) throw new Error(`skipped ${b.skip}`)
  return b
}

describe('duplicate PlayHQ period sequence numbers', () => {
  it('the fixture really has two periods numbered 3', () => {
    expect(raw().periods.map((p) => p.sequenceNo)).toEqual([1, 2, 3, 3])
  })

  it('gives our own ordinals 1..4, played first among equal PlayHQ numbers', () => {
    const b = map(raw())
    expect(b.innings.map((i) => i.sequenceNo)).toEqual([1, 2, 3, 4])
    expect(new Set(b.innings.map((i) => i.periodId)).size).toBe(4)
    expect(b.innings.map((i) => i.played)).toEqual([true, true, true, false])
    expect(b.innings.map((i) => i.playhqSequenceNo)).toEqual([1, 2, 3, 3])
  })

  it('points the real third innings children at ordinal 3 and gives the empty period none', () => {
    const b = map(raw())
    expect(b.batting.filter((r) => r.inningsSeq === 3)).toHaveLength(11)
    expect(b.batting.filter((r) => r.inningsSeq === 4)).toHaveLength(0)
    expect(b.bowling.filter((r) => r.inningsSeq === 4)).toHaveLength(0)
    expect(b.fielding.filter((r) => r.inningsSeq === 4)).toHaveLength(0)
    const empty = b.innings[3]
    expect(empty).toMatchObject({ totalRuns: 0, totalWickets: 0, totalBalls: 0, hasFallOfWickets: false, hasBowlingData: false, hasBallData: false })
  })

  it('warns instead of failing', () => {
    expect(map(raw()).warnings).toContain('duplicate_sequence:3')
  })

  it('keeps the same order and hash when PlayHQ reorders the periods array', () => {
    const r = raw()
    const reversed = { ...r, periods: [...r.periods].reverse() }
    const a = map(r), b = map(reversed)
    expect(b.innings.map((i) => i.periodId)).toEqual(a.innings.map((i) => i.periodId))
    expect(b.sourceHash).toBe(a.sourceHash)
  })

  it('is mapper version 2', () => {
    expect(MAPPER_VERSION).toBe(2)
  })

  it('leaves games with unique, contiguous numbers unchanged (ordinal equals the PlayHQ number)', () => {
    const r = clone(twoDay.data) as unknown as RawGameSummary
    const b = map(r)
    expect(b.innings.map((i) => i.sequenceNo)).toEqual(r.periods.map((p) => p.sequenceNo))
    expect(b.innings.every((i) => i.sequenceNo === i.playhqSequenceNo)).toBe(true)
    expect(b.warnings.some((w) => w.startsWith('duplicate_sequence'))).toBe(false)
  })

  it('an unordered, non-contiguous game still gets 1..n', () => {
    const r = clone(twoDay.data) as unknown as RawGameSummary
    r.periods.forEach((p, i) => { p.sequenceNo = [10, 20, 30, 40][i] })
    const b = map(r)
    expect(b.innings.map((i) => i.sequenceNo)).toEqual([1, 2, 3, 4])
    expect(b.batting.every((x) => x.inningsSeq >= 1 && x.inningsSeq <= 4)).toBe(true)
  })

  it('assertUniqueInnings throws, naming the game, on a duplicate ordinal or period id', () => {
    const b = map(raw())
    expect(() => assertUniqueInnings(b)).not.toThrow()
    const dupSeq = { ...b, innings: [b.innings[0], { ...b.innings[1], sequenceNo: 1 }] }
    expect(() => assertUniqueInnings(dupSeq)).toThrow(new RegExp(`${b.match.gameId}.*sequence 1`))
    const dupPeriod = { ...b, innings: [b.innings[0], { ...b.innings[1], periodId: b.innings[0].periodId }] }
    expect(() => assertUniqueInnings(dupPeriod)).toThrow(new RegExp(`${b.match.gameId}.*period`))
  })

  it('upsertMatchBundle rejects a duplicate bundle before it touches the database', async () => {
    const b = map(raw())
    const bad = { ...b, innings: [b.innings[0], { ...b.innings[1], sequenceNo: 1 }] }
    const touched = vi.fn(() => { throw new Error('database touched') })
    const payload = { db: { tables: {}, drizzle: { select: touched, transaction: touched, insert: touched, update: touched, delete: touched } } }
    await expect(upsertMatchBundle(payload as never, bad, new Map())).rejects.toThrow(/duplicate innings sequence/)
    expect(touched).not.toHaveBeenCalled()
  })
})

describe('empty periods in the public scorecard', () => {
  it('isEmptyPeriod: empty twin yes, two-day placeholders (12 did-not-bat appearances) no', () => {
    const periods = raw().periods
    expect(periods.map(isEmptyPeriod)).toEqual([false, false, false, true])
    expect((twoDay.data as unknown as RawGameSummary).periods.map(isEmptyPeriod)).toEqual([false, false, false, false])
  })

  it('mapScorecard shows three innings for the duplicate game (no ghost)', () => {
    const sc = mapScorecard(raw(), ORG, false)
    expect(sc.innings).toHaveLength(3)
    expect(sc.innings.map((i) => i.sequenceNo)).toEqual([1, 2, 3])
  })

  it('mapScorecard still shows the two-day placeholders', () => {
    expect(mapScorecard(clone(twoDay.data) as never, ORG, false).innings).toHaveLength(4)
  })
})

describe('anonymised fixture guard', () => {
  it('every person name in the fixture is a fake name', () => {
    const names = raw().appearances.map((a) => `${a.firstName} ${a.lastName}`)
    expect(names.length).toBeGreaterThan(10)
    for (const n of names) expect(n).toMatch(/^(Home|Away) (Player|Coach) \d{2}$/)
  })
})
