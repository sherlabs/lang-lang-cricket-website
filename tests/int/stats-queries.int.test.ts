import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateStatsSeed, PLANTED } from '@/payload/scripts/fixtures/stats-seed-data'
import { seedStats } from '@/payload/scripts/fixtures/stats-seed-db'
import { careerOf } from '@/lib/stats/aggregate'
import { buildLeaderboard } from '@/lib/stats/leaderboard'
import { DEFAULT_STATS_SETTINGS } from '@/lib/site-settings-core'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetPlayers } from './players-helpers'

// Spec section 6: stats-queries.int. Runs the real queries against the seeded langlang_test DB.
// Outside a Next request `unstable_cache` has no cache store, so queries fall back to the
// uncached loader; the cache-invalidation clause is therefore covered by the dev-server check.
describe('stats queries', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetGlobal(payload, 'site-settings')
    await resetPlayers(payload)
    await seedStats(payload)
  }, 180_000)

  afterAll(async () => {
    await resetPlayers(payload)
    await resetGlobal(payload, 'site-settings')
    await destroyTestPayload(payload)
  })

  const seed = generateStatsSeed()
  const nameOf = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`

  it('never returns hidden players, and counts match the seed', async () => {
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    const data = await getVisibleStatData()
    const names = [...data.players.values()].map((p) => p.name)
    for (const h of seed.filter((p) => p.hidden)) expect(names).not.toContain(nameOf(h))
    expect(data.players.size).toBe(seed.filter((p) => !p.hidden).length)
    const expectedRows = seed.filter((p) => !p.hidden).reduce((n, p) => n + p.rows.length, 0)
    expect(data.rows).toHaveLength(expectedRows)
    expect(data.rows.every((r) => data.players.has(r.playerId))).toBe(true)
  })

  it('exposes only the real seasons, newest group empty', async () => {
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    const { seasons } = await getVisibleStatData()
    expect(seasons.map((s) => s.seasonName)).toEqual(['Summer 2025/26', 'Summer 2024/25', 'Summer 2023/24'])
    expect(seasons[0].seasonOrder).toBe(1)
  })

  it('planted career leader is #1 on runs with exactly the planted total', async () => {
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    const data = await getVisibleStatData()
    const lb = buildLeaderboard(data.rows, { season: 'all', grade: 'all', metric: 'runs' }, DEFAULT_STATS_SETTINGS.defaultIncludedCategories, DEFAULT_STATS_SETTINGS)
    const top = lb.result.ranked[0]
    expect(data.players.get(top.item.playerId)?.slug).toBe(PLANTED.careerLeader.slug)
    expect(top.value).toBe(PLANTED.careerLeader.runs)
    expect(top.rank).toBe(1)
  })

  it('merges multi-team seasons: the near-milestone player has 99 games', async () => {
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    const data = await getVisibleStatData()
    const id = [...data.players.values()].find((p) => p.slug === PLANTED.nearMilestone.slug)!.id
    const career = careerOf(data.rows.filter((r) => r.playerId === id))[0]
    expect(career.counts.games).toBe(99)
    expect(career.seasons).toBe(3)
  })

  it('the admin query still returns hidden players, and hiding removes a player from the public query', async () => {
    const { getAllStatRowsForAdmin, getVisibleStatData } = await import('@/lib/stats/queries')
    const admin = await getAllStatRowsForAdmin()
    expect([...admin.players.values()].map((p) => p.slug)).toEqual(expect.arrayContaining(PLANTED.hidden as unknown as string[]))
    expect(admin.rows.length).toBeGreaterThan((await getVisibleStatData()).rows.length)

    const victim = (await getVisibleStatData()).players.get(
      [...(await getVisibleStatData()).players.values()].find((p) => p.slug === PLANTED.wicketLeader.slug)!.id,
    )!
    await payload.update({ collection: 'players', id: victim.id, data: { hidden: true }, context: { disableRevalidate: true } })
    const after = await getVisibleStatData()
    expect(after.players.has(victim.id)).toBe(false)
    expect(after.rows.some((r) => r.playerId === victim.id)).toBe(false)
    await payload.update({ collection: 'players', id: victim.id, data: { hidden: false }, context: { disableRevalidate: true } })
  })

  it('getStatsSettings returns defaults before the global is saved', async () => {
    const { getStatsSettings } = await import('@/lib/site-settings')
    expect(await getStatsSettings()).toEqual(DEFAULT_STATS_SETTINGS)
  })
})
