import { describe, expect, it } from 'vitest'
import { buildRounds, currentRound, isTerminal, NO_RESULT_FIXTURE_STATUSES, type RoundFixture } from '../lib/fantasy/rounds'

const f = (gameId: string, localDate: string, over: Partial<RoundFixture> = {}): RoundFixture => ({ gameId, localDate, startsAt: `${localDate}T03:00:00Z`, status: 'upcoming', ...over })
const NOW = new Date('2025-10-15T00:00:00Z')

describe('rounds', () => {
  it('groups fixtures by club weekend (Monday to Sunday, keyed by Saturday) and ignores removed ones', () => {
    const rounds = buildRounds([f('a', '2025-10-11'), f('b', '2025-10-12'), f('c', '2025-10-18'), f('x', '2025-10-18', { status: 'removed' })], [], new Set(), NOW)
    expect(rounds.map((r) => [r.key, r.fixtures.length])).toEqual([['2025-10-11', 2], ['2025-10-18', 1]])
  })
  it('upcoming before the lock, locked after it, scored when every fixture has a stored game', () => {
    const fixtures = [f('a', '2025-10-11'), f('b', '2025-10-12')]
    expect(buildRounds(fixtures, [], new Set(), new Date('2025-10-10T00:00:00Z'))[0].status).toBe('upcoming')
    expect(buildRounds(fixtures, [], new Set(['a']), NOW)[0].status).toBe('locked')
    const done = buildRounds(fixtures, [], new Set(['a', 'b']), NOW)[0]
    expect(done.status).toBe('scored')
    expect(done.provisional).toBe(false)
    expect(done.closedByCommittee).toBe(false)
  })
  it('a final fixture with no stored game yet is not terminal (it waits for the match store)', () => {
    expect(buildRounds([f('a', '2025-10-11', { status: 'final' })], [], new Set(), NOW)[0].status).toBe('locked')
  })
  it('a round with an abandoned game is scored once the fixture says so, with the game contributing nothing', () => {
    expect(NO_RESULT_FIXTURE_STATUSES).toContain('abandoned')
    const r = buildRounds([f('a', '2025-10-11', { status: 'abandoned' }), f('b', '2025-10-12')], [], new Set(['b']), NOW)[0]
    expect(r.status).toBe('scored')
  })
  it('a stored game that was abandoned (FINAL with no result) makes the fixture terminal too', () => {
    expect(isTerminal(f('a', '2025-10-11'), new Set(['a']))).toBe(true)
  })
  it('the committee can mark a round scored (washed out or postponed games), and it says so', () => {
    const fixtures = [f('a', '2025-10-11'), f('wash', '2025-10-12')]
    const r = buildRounds(fixtures, [{ weekendKey: '2025-10-11', scoredManually: true }], new Set(['a']), NOW)[0]
    expect(r.status).toBe('scored')
    expect(r.closedByCommittee).toBe(true)
    expect(r.provisional).toBe(false)
  })
  it('a manual mark does not open a round before its lock', () => {
    expect(buildRounds([f('a', '2025-10-20')], [{ weekendKey: '2025-10-18', scoredManually: true }], new Set(), NOW)[0].status).toBe('upcoming')
  })
  it('uses the stored (lowest) lock and an override', () => {
    const r = buildRounds([f('a', '2025-10-11')], [{ weekendKey: '2025-10-11', locksAt: '2025-10-11T01:00:00Z' }], new Set(), new Date('2025-10-11T02:00:00Z'))[0]
    expect(r.locksAt.toISOString()).toBe('2025-10-11T01:00:00.000Z')
    expect(r.status).toBe('locked')
  })
  it('currentRound is the first round whose lock is in the future', () => {
    const rounds = buildRounds([f('a', '2025-10-11'), f('b', '2025-10-18'), f('c', '2025-10-25')], [], new Set(), NOW)
    expect(currentRound(rounds, NOW)?.key).toBe('2025-10-18')
    expect(currentRound(rounds, new Date('2026-01-01T00:00:00Z'))).toBeNull()
  })
})
