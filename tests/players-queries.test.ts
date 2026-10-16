import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

/**
 * Spec §2 / §14: the public players queries run with overrideAccess, so each `players` find
 * states its own `hidden: false` filter and passes `joins: false` (seasons/aliases are admin data).
 */
let fake: PayloadFake
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))

const player = (id: number, slug: string, hidden: boolean) => ({
  id, slug, hidden, firstName: slug, lastName: 'X', source: 'manual', bio: '', manualYears: '', activeOverride: null,
  isActiveDerived: false, photo: null, honours: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

beforeEach(() => {
  fake = createPayloadFake({
    players: [player(1, 'pat', false), player(2, 'secret', true)],
    'player-seasons': [],
  })
})

describe('players queries', () => {
  it('listPublicPlayers filters hidden players itself and skips joins', async () => {
    const { listPublicPlayers } = await import('@/lib/players/queries')
    await listPublicPlayers()
    const calls = fake.callsTo('find', 'players')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toMatchObject({ where: { hidden: { equals: false } }, joins: false })
  })

  it('getPlayerProfile filters on slug and hidden: false, skips joins, and returns null for a hidden player', async () => {
    const { getPlayerProfile } = await import('@/lib/players/queries')
    expect(await getPlayerProfile('secret')).toBeNull()
    const profile = await getPlayerProfile('pat')
    expect(profile?.player.slug).toBe('pat')
    const calls = fake.callsTo('find', 'players')
    expect(calls.map((c) => c.args)).toMatchObject([
      { where: { and: [{ slug: { equals: 'secret' } }, { hidden: { equals: false } }] }, joins: false },
      { where: { and: [{ slug: { equals: 'pat' } }, { hidden: { equals: false } }] }, joins: false },
    ])
  })
})
