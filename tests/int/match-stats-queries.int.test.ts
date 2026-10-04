/**
 * match-stats-queries.int (W2 WP-S1): the real fact queries against the seeded match store. A hidden
 * player is absent everywhere, including as a partner; forfeits give appearances but no innings and
 * no win; the stats cache tags are both revalidated.
 */
import { eq } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { matchTables } from '@/lib/match-store/db'
import { generateMatchSeed, MATCH_SEED_HIDDEN_KEY } from '../../payload/scripts/fixtures/match-seed-data'
import { seedMatchSeasonRows, seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { matchCountsOf } from '@/lib/stats/match/counts'
import { playerFacts } from '@/lib/stats/match/facts'
import { destroyTestPayload, getTestPayload } from './helpers'
import { resetMatches } from './match-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))
vi.mock('next/cache', () => cache)

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
let payload: Payload
let hiddenId: number

beforeAll(async () => {
  payload = await getTestPayload()
  await resetMatches(payload)
  await seedMatchStore(payload, { clubOrgId: ORG })
  await seedMatchSeasonRows(payload, ORG)
  const t = matchTables(payload)
  const [h] = await payload.db.drizzle.select({ id: t.players.id }).from(t.players).innerJoin(t.player_aliases, eq(t.player_aliases.player, t.players.id)).where(eq(t.player_aliases.nameKey, MATCH_SEED_HIDDEN_KEY))
  hiddenId = h.id
}, 180_000)
afterAll(async () => {
  await resetMatches(payload)
  await destroyTestPayload(payload)
})

describe('getSeasonFacts / getAllFacts', () => {
  it('stores every FINAL non-skipped game and nothing else', async () => {
    const { getAllFacts, getMatchSeasonYears } = await import('@/lib/match-store/stats-queries')
    const all = await getAllFacts()
    const seeded = generateMatchSeed(ORG).filter((g) => g.raw.status === 'FINAL')
    expect(all.matches.size).toBe(seeded.length)
    expect(await getMatchSeasonYears()).toEqual([2025, 2024])
    // Both senior seasons, headers carry the opposition key and label.
    expect([...all.matches.values()].every((h) => h.oppKey && h.oppLabel)).toBe(true)
  })

  it('never contains a hidden player: not as a row, an appearance, or a partner', async () => {
    const { getAllFacts } = await import('@/lib/match-store/stats-queries')
    const all = await getAllFacts()
    const ids = new Set([
      ...all.appearances.map((a) => a.player), ...all.bat.map((b) => b.player), ...all.bowl.map((b) => b.player), ...all.credits.map((c) => c.player),
      ...all.partnerships.flatMap((p) => [p.a, p.b]),
    ])
    expect(ids.has(hiddenId)).toBe(false)
    // The hidden player did bat in partnerships: those pairs survive with a null partner, never the id.
    expect(all.partnerships.some((p) => p.a === null || p.b === null)).toBe(true)
    expect(JSON.stringify([...all.matches.values()])).not.toMatch(/glover/i)
  })

  it('hiding another player removes them from every fact, and they become an anonymous partner', async () => {
    const { getAllFacts } = await import('@/lib/match-store/stats-queries')
    const before = await getAllFacts()
    const target = before.bat[0].player
    const t = matchTables(payload)
    await payload.db.drizzle.update(t.players).set({ hidden: true }).where(eq(t.players.id, target))
    try {
      const after = await getAllFacts()
      expect(after.bat.some((b) => b.player === target)).toBe(false)
      expect(after.partnerships.some((p) => p.a === target || p.b === target)).toBe(false)
      expect(after.partnerships.length).toBe(before.partnerships.length)
    } finally {
      await payload.db.drizzle.update(t.players).set({ hidden: false }).where(eq(t.players.id, target))
    }
  })

  it('a forfeit is an appearance but not an innings, and never a win', async () => {
    const { getAllFacts } = await import('@/lib/match-store/stats-queries')
    const all = await getAllFacts()
    const forfeits = [...all.matches.values()].filter((h) => h.forfeit)
    expect(forfeits.length).toBe(2)
    for (const h of forfeits) {
      expect([...all.innings.values()].some((i) => i.m === h.id)).toBe(false)
      expect(all.bat.some((b) => b.m === h.id)).toBe(false)
    }
    const wonForfeit = forfeits.find((h) => h.result === 'won')!
    const p = all.appearances.find((a) => a.m === wonForfeit.id)!.player
    const mine = playerFacts(all, p)
    const counts = matchCountsOf(mine)
    const nonForfeitWins = [...mine.matches.values()].filter((h) => !h.forfeit && h.result === 'won').length
    expect(counts.wins).toBe(nonForfeitWins)
    expect(counts.games).toBe(mine.appearances.length)
  })

  it('getPlayerMatchFacts is null for a player with no stored match', async () => {
    const { getPlayerMatchFacts } = await import('@/lib/match-store/stats-queries')
    expect(await getPlayerMatchFacts(999_999)).toBeNull()
  })
})

describe('revalidation', () => {
  it('expires both stats tags after a player change', async () => {
    cache.revalidateTag.mockClear()
    const { revalidatePlayerPages } = await import('@/lib/players/revalidate')
    await revalidatePlayerPages()
    const tags = cache.revalidateTag.mock.calls.map((c) => c[0])
    expect(tags).toEqual(['player-stats', 'match-store'])
    expect(cache.revalidateTag.mock.calls.every((c) => (c[1] as { expire: number }).expire === 0)).toBe(true)
  })

  it('a Players hide hook expires both tags too', async () => {
    cache.revalidateTag.mockClear()
    const t = matchTables(payload)
    const [p] = await payload.db.drizzle.select({ id: t.players.id }).from(t.players).limit(1)
    await payload.update({ collection: 'players', id: p.id, data: { bio: 'x' }, overrideAccess: true })
    expect(cache.revalidateTag.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['player-stats', 'match-store']))
  })
})
