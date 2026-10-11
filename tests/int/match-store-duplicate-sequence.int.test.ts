/**
 * WP-0 (wave B spec section 2) against real Postgres: a game with two PlayHQ periods numbered 3 saves with our own ordinals, a
 * second identical sync is `unchanged`, and a malformed (duplicate) bundle fails alone: counted, named, and the other games still save.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import dup from '../fixtures/playhq/game-summary-duplicate-sequence.json'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import { matchTables } from '@/lib/match-store/db'
import { storedMatchIndex, upsertMatchBundle } from '@/lib/match-store/write'
import { writeMatchStore, type CollectedData } from '@/lib/players/sync'
import { isSkip, mapMatchBundle, type MatchBundle } from '@/lib/playhq/match-rows'
import type { RawGameSummary } from '@/lib/playhq/types'
import { destroyTestPayload, getTestPayload } from './helpers'
import { resetMatches } from './match-helpers'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
let payload: Payload

beforeAll(async () => {
  payload = await getTestPayload()
})
afterAll(async () => {
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetMatches(payload)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const bundleOf = (data: unknown): MatchBundle => {
  const raw = JSON.parse(JSON.stringify(data)) as RawGameSummary
  const b = mapMatchBundle(raw, {
    clubOrgId: ORG, clubIds: new Set(raw.teams.filter((x) => x.organisation?.id === ORG).map((x) => x.id)),
    seasonName: 'Summer 2025/26', seasonStartYear: 2025, competitionName: 'Seniors', isJunior: false, fixture: null,
  })
  if (isSkip(b)) throw new Error(`skipped ${b.skip}`)
  return b
}
const inningsRows = async () => {
  const t = matchTables(payload)
  return (await payload.db.drizzle.select().from(t.match_innings)) as R[]
}
const collected = (bundles: MatchBundle[]): CollectedData => ({
  aggregates: [], matchAggregates: [], skipped: [], partialPairs: [], refreshed: 0, deferred: 0,
  visitedPairs: bundles.map((b) => ({ clubTeamId: b.match.clubTeamId, seasonName: 'Summer 2025/26' })),
  matches: bundles.map((bundle) => ({ bundle, seasonName: 'Summer 2025/26', teamId: bundle.match.clubTeamId })),
})

describe('duplicate PlayHQ period sequence numbers, stored', () => {
  it('saves four innings with ordinals 1..4 and the children on the real third innings', async () => {
    const b = bundleOf(dup.data)
    expect(await upsertMatchBundle(payload, b, new Map())).toBe('created')
    const rows = (await inningsRows()).sort((x, y) => x.sequenceNo - y.sequenceNo)
    expect(rows.map((r) => Number(r.sequenceNo))).toEqual([1, 2, 3, 4])
    expect(rows.map((r) => r.played)).toEqual([true, true, true, false])
    expect(rows.map((r) => Number(r.playhqSequenceNo))).toEqual([1, 2, 3, 3])
    expect(new Set(rows.map((r) => r.periodId)).size).toBe(4)
    const t = matchTables(payload)
    const batting = (await payload.db.drizzle.select().from(t.match_batting)) as R[]
    const third = rows.find((r) => Number(r.sequenceNo) === 3)!
    const fourth = rows.find((r) => Number(r.sequenceNo) === 4)!
    expect(batting.filter((r) => r.innings === third.id)).toHaveLength(11)
    expect(batting.filter((r) => r.innings === fourth.id)).toHaveLength(0)
  })

  it('a second write of the unchanged game is unchanged, with and without the stored index', async () => {
    const b = bundleOf(dup.data)
    await upsertMatchBundle(payload, b, new Map())
    expect(await upsertMatchBundle(payload, bundleOf(dup.data), new Map())).toBe('unchanged')
    expect(await upsertMatchBundle(payload, bundleOf(dup.data), new Map(), await storedMatchIndex(payload))).toBe('unchanged')
    expect(await inningsRows()).toHaveLength(4)
  })

  it('the unique (match, period id) index rejects a repeated period', async () => {
    await upsertMatchBundle(payload, bundleOf(dup.data), new Map())
    const t = matchTables(payload)
    const [first] = (await inningsRows())
    const { id: _id, ...copy } = first
    void _id
    await expect(payload.db.drizzle.insert(t.match_innings).values({ ...copy, sequenceNo: 99 })).rejects.toThrow()
  })

  it('a duplicate bundle fails alone: counted, named, the other game still saves and nothing of the bad one is written', async () => {
    const good = bundleOf(oneDay.data)
    const bad = bundleOf(dup.data)
    bad.innings = [bad.innings[0], { ...bad.innings[1], sequenceNo: bad.innings[0].sequenceNo }]
    const counters = await writeMatchStore(payload, collected([bad, good]), new Map())
    expect(counters.matchError).toBe(1)
    expect(counters.matchesUpserted).toBe(1)
    expect(counters.failures).toHaveLength(1)
    expect(counters.failures![0]).toContain(bad.match.gameId)
    const stored = (await payload.db.drizzle.execute(sql.raw('SELECT game_id FROM "payload"."matches"'))).rows.map((r) => r.game_id)
    expect(stored).toEqual([good.match.gameId])
  })

  it('past the write budget the remaining games are deferred and counted, with the bumped mapper version', async () => {
    const counters = await writeMatchStore(payload, collected([bundleOf(dup.data), bundleOf(oneDay.data)]), new Map(), { deadlineAt: Date.now() - 1000 })
    expect(counters.matchesDeferred).toBe(2)
    expect(counters.matchesUpserted).toBe(0)
    expect(counters.matchError).toBe(0)
  })
})
