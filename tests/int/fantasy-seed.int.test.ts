/**
 * fantasy-seed.int (wave F WP-2, spec 4.10): the demo seed builds a believable competition on top of the demo match store: an open
 * season with prices for seniors, finished rounds (scored and closed by the committee), invented teams with valid squads, a public
 * leaderboard, PINs only in the console, and it is idempotent.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computeLeaderboard } from '@/lib/fantasy/queries'
import { getFantasySettings, getOpenSeason, loadPool } from '@/lib/fantasy/store'
import { seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { seedDemoFantasy } from '../../payload/seed/demo-fantasy'
import { destroyTestPayload, getTestPayload, wipeTestData } from './helpers'
import { makeUser, resetFantasy } from './fantasy-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'

describe('demo fantasy seed', () => {
  let payload: Payload
  const logs: string[] = []

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetFantasy(payload)
    await seedMatchStore(payload, { clubOrgId: ORG })
    await makeUser(payload, 'admin')
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')))
  }, 180_000)

  afterAll(async () => {
    vi.restoreAllMocks()
    await wipeTestData(payload)
    await destroyTestPayload(payload)
  })

  it('builds an open season, eight invented teams and finished rounds, and prints the PINs to the console only', async () => {
    const result = await seedDemoFantasy(payload)
    expect(result).toMatch(/open, \d+ priced players, \d+ finished rounds, 8 teams/)
    const season = (await getOpenSeason(payload))!
    expect(season.status).toBe('open')
    const settings = await getFantasySettings(payload)
    expect(settings).toMatchObject({ enabled: true, publicLeaderboard: true })
    const pool = await loadPool(payload, season.id)
    expect(pool.size).toBeGreaterThanOrEqual(11)
    // The pool is built from the senior filter and nobody who is hidden or under 18 is in it.
    for (const p of pool.values()) expect(p.inGame).toBe(true)
    const entries = await payload.find({ collection: 'fantasy-entries', limit: 20, depth: 0, overrideAccess: true })
    expect(entries.totalDocs).toBe(8)
    const out = logs.join('\n')
    for (const pin of ['482915', '730264']) expect(out).toContain(pin)
    expect(JSON.stringify(entries.docs)).not.toMatch(/482915|730264|915372/)
  })

  it('every seeded squad is valid for its season rules and the leaderboard is computed from the stored games', async () => {
    const season = (await getOpenSeason(payload))!
    const pool = await loadPool(payload, season.id)
    const squads = await payload.find({ collection: 'fantasy-squads', limit: 500, depth: 0, overrideAccess: true })
    expect(squads.totalDocs).toBeGreaterThan(8)
    for (const s of squads.docs as unknown as { picks: { player: number }[]; captain: number; spentTenths: number }[]) {
      expect(s.picks).toHaveLength(season.rules.squadSize)
      expect(new Set(s.picks.map((p) => p.player)).size).toBe(season.rules.squadSize)
      const spent = s.picks.reduce((sum, p) => sum + (pool.get(p.player)?.priceTenths ?? 0), 0)
      expect(spent).toBeLessThanOrEqual(season.rules.salaryCapTenths)
      expect(s.picks.map((p) => p.player)).toContain(s.captain)
    }
    const lb = await computeLeaderboard(payload, season)
    expect(lb.rows).toHaveLength(8)
    expect(lb.rounds.length).toBeGreaterThanOrEqual(3)
    expect(lb.rounds.some((r) => r.status === 'scored' && !r.provisional)).toBe(true)
    expect(lb.rounds.some((r) => r.closedByCommittee)).toBe(true)
    const totals = lb.rows.map((r) => r.total)
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
    expect(Math.max(...totals)).toBeGreaterThan(0)
  })

  it('is idempotent', async () => {
    expect(await seedDemoFantasy(payload)).toBe('already present, skipped')
    expect((await payload.count({ collection: 'fantasy-entries', overrideAccess: true })).totalDocs).toBe(8)
  })
})
