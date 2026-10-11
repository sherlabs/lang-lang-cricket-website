import { describe, expect, it } from 'vitest'
import type { Game } from '../lib/playhq/types'
import { gameToFixture, inWindow, planFixtureUpsert, wallClockToUtc, type FixtureInput, type StoredFixture } from '../lib/selection/fixtures-plan'

const game = (over: Partial<Game> = {}): Game => ({
  id: 'g1', status: 'UPCOMING', url: '', updatedAt: null, gradeId: 'gr1', gradeName: 'B Grade', roundName: 'Round 5', roundAbbr: 'R5', isFinalRound: false,
  localDate: '2026-10-17', localTime: '13:00:00', sortKey: '', venueName: 'Home Oval', venueSuburb: 'Town',
  club: { id: 't1', name: 'Test Club B Grade', isHome: true, outcome: null, score: null },
  opponent: { id: 'o1', name: 'Example Rovers', isHome: false, outcome: null, score: null }, isClubDerby: false, ...over,
})
const team = { id: 't1', name: 'Test Club B Grade' }
const fixture = (over: Partial<FixtureInput> = {}): FixtureInput => ({ ...gameToFixture(game(), team)!, ...over })
const stored = (over: Partial<StoredFixture> = {}): StoredFixture => ({ id: 1, ...fixture(), ...over })

describe('wallClockToUtc', () => {
  it('converts club wall-clock to UTC across daylight saving', () => {
    expect(wallClockToUtc('2026-10-17', '13:00:00', 'Australia/Melbourne')).toBe('2026-10-17T02:00:00.000Z') // AEDT +11
    expect(wallClockToUtc('2026-07-18', '13:00:00', 'Australia/Melbourne')).toBe('2026-07-18T03:00:00.000Z') // AEST +10
    expect(wallClockToUtc('2026-10-17', null, 'UTC')).toBe('2026-10-17T00:00:00.000Z')
    expect(wallClockToUtc('nope', null, 'UTC')).toBeNull()
  })
})

describe('gameToFixture and inWindow', () => {
  it('maps a game and marks FINAL games final', () => {
    expect(fixture()).toMatchObject({ gameId: 'g1', gradeName: 'B Grade', opponentName: 'Example Rovers', isHome: true, status: 'upcoming', clubTeamId: 't1' })
    expect(gameToFixture(game({ status: 'FINAL' }), team)!.status).toBe('final')
  })
  it('needs a date and a club team', () => {
    expect(gameToFixture(game({ localDate: null }), team)).toBeNull()
    expect(gameToFixture(game(), undefined)).toBeNull()
  })
  it('keeps 14 days back and 120 days ahead', () => {
    expect(inWindow('2026-09-21', '2026-10-05')).toBe(true)
    expect(inWindow('2026-09-20', '2026-10-05')).toBe(false)
    expect(inWindow('2027-02-02', '2026-10-05')).toBe(true)
    expect(inWindow('2027-02-03', '2026-10-05')).toBe(false)
    expect(inWindow('garbage', '2026-10-05')).toBe(false)
  })
})

describe('planFixtureUpsert', () => {
  const today = '2026-10-05'
  it('creates new games', () => {
    const plan = planFixtureUpsert([fixture()], [], today)
    expect(plan.create).toHaveLength(1)
    expect(plan.update).toHaveLength(0)
  })
  it('keeps an unchanged game', () => {
    const plan = planFixtureUpsert([fixture()], [stored()], today)
    expect(plan).toMatchObject({ kept: 1, create: [], update: [], remove: [] })
  })
  it('updates a rescheduled game and says it moved', () => {
    const plan = planFixtureUpsert([fixture({ localTime: '10:00:00', startsAt: 'x' })], [stored()], today)
    expect(plan.update).toHaveLength(1)
    expect(plan.update[0]).toMatchObject({ id: 1, moved: true })
    expect(plan.update[0].data.localTime).toBe('10:00:00')
  })
  it('a change that is not a move (opponent) is an update but not moved', () => {
    const plan = planFixtureUpsert([fixture({ opponentName: 'Other FC' })], [stored()], today)
    expect(plan.update[0].moved).toBe(false)
  })
  it('marks a stored upcoming game PlayHQ no longer lists as removed, never a final one', () => {
    const plan = planFixtureUpsert([], [stored({ id: 1 }), stored({ id: 2, gameId: 'g2', status: 'final' }), stored({ id: 3, gameId: 'g3', status: 'removed' })], today)
    expect(plan.remove).toEqual([1])
  })
  it('restores a removed game that comes back', () => {
    const plan = planFixtureUpsert([fixture()], [stored({ status: 'removed' })], today)
    expect(plan.update[0].data).toEqual({ status: 'upcoming' })
  })
  it('skips incoming games outside the window', () => {
    const plan = planFixtureUpsert([fixture({ gameId: 'far', localDate: '2027-06-01' })], [], today)
    expect(plan).toMatchObject({ create: [], skippedOutOfWindow: 1 })
  })
})

describe('planFixtureUpsert moved flag', () => {
  it('flags a venue suburb change as moved but not a result or opponent change', () => {
    const moved = planFixtureUpsert([fixture({ venueSuburb: 'Elsewhere' })], [stored()], '2026-10-05')
    expect(moved.update[0].moved).toBe(true)
    const final = planFixtureUpsert([fixture({ status: 'final', opponentName: 'Renamed FC' })], [stored()], '2026-10-05')
    expect(final.update[0].moved).toBe(false)
  })
})
