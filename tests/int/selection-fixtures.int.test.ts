import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Game } from '@/lib/playhq/types'
import { refreshSelectionFixtures, type FixtureSource } from '@/lib/selection-fixtures'
import { destroyTestPayload, getTestPayload } from './helpers'
import { isoDate, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)
// Nothing here may reach PlayHQ: the source is always injected, and the real client is never imported for a call.
vi.mock('@/lib/playhq/queries', () => ({ getClubGames: vi.fn(() => { throw new Error('PlayHQ must not be called') }), resolveSeason: vi.fn(() => { throw new Error('PlayHQ must not be called') }), isJuniorGrade: (g: string) => /under|u\d+/i.test(g) }))

const team = (id: string, name: string, isJunior = false) => ({ id, name, isJunior })
const game = (id: string, over: Partial<Game> = {}): Game => ({
  id, status: 'UPCOMING', url: '', updatedAt: null, gradeId: 'gr-b', gradeName: 'B Grade', roundName: 'Round 5', roundAbbr: 'R5', isFinalRound: false,
  localDate: isoDate(6), localTime: '13:00:00', sortKey: '', venueName: 'Home Oval', venueSuburb: 'Town',
  club: { id: 't-b', name: 'Test Club B Grade', isHome: true, outcome: null, score: null },
  opponent: { id: 'o1', name: 'Example Rovers', isHome: false, outcome: null, score: null }, isClubDerby: false, ...over,
})
const source = (games: Game[]): FixtureSource => async () => ({ games, teams: [team('t-b', 'Test Club B Grade'), team('t-u', 'Test Club Under 12', true)] })

describe('refreshSelectionFixtures (mocked PlayHQ)', () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  })
  afterAll(async () => {
    await resetSelection(payload)
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
  })
  const rows = async () => (await payload.find({ collection: 'selection-fixtures', overrideAccess: true, depth: 0, pagination: false, sort: 'gameId' })).docs

  it('stores new games with the grade key, club-time start and no duplicates on a second run', async () => {
    const first = await refreshSelectionFixtures(payload, { source: source([game('g1'), game('g2', { localDate: isoDate(13) })]) })
    expect(first).toMatchObject({ created: 2, updated: 0, removed: 0 })
    const [a] = await rows()
    expect(a).toMatchObject({ gameId: 'g1', gradeId: 'gr-b', gradeName: 'B Grade', clubTeamName: 'Test Club B Grade', opponentName: 'Example Rovers', isHome: true, status: 'upcoming' })
    expect(a.startsAt).toBeTruthy()
    const second = await refreshSelectionFixtures(payload, { source: source([game('g1'), game('g2', { localDate: isoDate(13) })]) })
    expect(second).toMatchObject({ created: 0, updated: 0, removed: 0, kept: 2 })
    expect(await rows()).toHaveLength(2)
  })

  it('keeps responses with a rescheduled game: same row, new time', async () => {
    await refreshSelectionFixtures(payload, { source: source([game('g1')]) })
    const [before] = await rows()
    const moved = await refreshSelectionFixtures(payload, { source: source([game('g1', { localTime: '10:30:00', venueName: 'Away Park' })]) })
    expect(moved).toMatchObject({ updated: 1, moved: 1 })
    const [after] = await rows()
    expect(after.id).toBe(before.id)
    expect(after).toMatchObject({ localTime: '10:30:00', venueName: 'Away Park' })
  })

  it('marks a game PlayHQ no longer lists as removed (never deletes), and restores it if it returns', async () => {
    await refreshSelectionFixtures(payload, { source: source([game('g1'), game('g2')]) })
    const gone = await refreshSelectionFixtures(payload, { source: source([game('g1')]) })
    expect(gone.removed).toBe(1)
    expect((await rows()).find((r) => r.gameId === 'g2')?.status).toBe('removed')
    await refreshSelectionFixtures(payload, { source: source([game('g1'), game('g2')]) })
    expect((await rows()).find((r) => r.gameId === 'g2')?.status).toBe('upcoming')
  })

  it('skips junior grades and games of teams that are not the club\'s, and games outside the window', async () => {
    const res = await refreshSelectionFixtures(payload, {
      source: source([
        game('junior', { gradeName: 'Under 12', club: { id: 't-u', name: 'Test Club Under 12', isHome: true, outcome: null, score: null } }),
        game('stranger', { club: { id: 'someone-else', name: 'X', isHome: true, outcome: null, score: null } }),
        game('far', { localDate: isoDate(400) }),
        game('ok'),
      ]),
    })
    expect(res.created).toBe(1)
    expect((await rows()).map((r) => r.gameId)).toEqual(['ok'])
  })

  it('a PlayHQ failure leaves the stored games untouched and is thrown to the caller', async () => {
    await refreshSelectionFixtures(payload, { source: source([game('g1')]) })
    await expect(refreshSelectionFixtures(payload, { source: async () => { throw new Error('PlayHQ 503') } })).rejects.toThrow('PlayHQ 503')
    expect(await rows()).toHaveLength(1)
  })
})
