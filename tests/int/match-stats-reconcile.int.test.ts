/**
 * match-stats-reconcile.int (W2 WP-S1): the derived facts agree with the season counts the sync
 * would have written, and `batRunsUnballed` reconciles with zero tolerance (the foundation change).
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { matchTables } from '@/lib/match-store/db'
import { matchCountsOf } from '@/lib/stats/match/counts'
import { splitByPlayer } from '@/lib/stats/match/facts'
import { seedMatchSeasonRows, seedMatchStore, reconcileSeed } from '../../payload/scripts/fixtures/match-seed-db'
import { destroyTestPayload, getTestPayload } from './helpers'
import { resetMatches } from './match-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
let payload: Payload

beforeAll(async () => {
  payload = await getTestPayload()
  await resetMatches(payload)
  await seedMatchStore(payload, { clubOrgId: ORG })
  await seedMatchSeasonRows(payload, ORG)
}, 180_000)
afterAll(async () => {
  await resetMatches(payload)
  await destroyTestPayload(payload)
})

describe('derived facts versus season counts', () => {
  it('the sync reconciliation is clean, now including batRunsUnballed', async () => {
    const rec = await reconcileSeed(payload, ORG)
    expect(rec.mismatchedPlayers).toBe(0)
  })

  it('runs, innings, games and unballed runs per player equal the season rows', async () => {
    const { getAllFacts } = await import('@/lib/match-store/stats-queries')
    const all = await getAllFacts()
    const t = matchTables(payload)
    const seasons: Record<string, number>[] = await payload.db.drizzle.select().from((payload.db.tables as Record<string, never>).player_seasons)
    void t
    const sum = (id: number, k: string) => seasons.filter((s) => s.player === id).reduce((n, s) => n + Number(s[k]), 0)
    const by = splitByPlayer(all)
    expect(by.size).toBeGreaterThan(10)
    let unballedTotal = 0
    for (const [id, set] of by) {
      const c = matchCountsOf(set)
      const unballed = set.bat.filter((b) => b.balls === null).reduce((n, b) => n + b.runs, 0)
      unballedTotal += unballed
      expect(c.games, `games ${id}`).toBe(sum(id, 'games'))
      expect(c.runs, `runs ${id}`).toBe(sum(id, 'batRuns'))
      expect(c.battingInnings, `innings ${id}`).toBe(sum(id, 'batInnings'))
      expect(unballed, `unballed ${id}`).toBe(sum(id, 'batRunsUnballed'))
    }
    // The seed has an innings with no ball data, so the figure is not trivially zero.
    expect(unballedTotal).toBeGreaterThan(0)
  })

  it('fifties and hundreds are consistent with the stored high scores', async () => {
    const { getAllFacts } = await import('@/lib/match-store/stats-queries')
    const by = splitByPlayer(await getAllFacts())
    const seasons: Record<string, number>[] = await payload.db.drizzle.select().from((payload.db.tables as Record<string, never>).player_seasons)
    for (const [id, set] of by) {
      const c = matchCountsOf(set)
      const hs = Math.max(0, ...seasons.filter((s) => s.player === id).map((s) => Number(s.batHighScore)))
      // A hundred in the facts means the season high score is at least 100, and the reverse.
      expect(c.hundreds > 0, `hundred ${id}`).toBe(hs >= 100)
      if (hs >= 50) expect(c.fifties + c.hundreds).toBeGreaterThan(0)
      else expect(c.fifties + c.hundreds).toBe(0)
    }
  })
})
