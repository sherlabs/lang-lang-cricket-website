/**
 * match-store.int (WP-M, spec M9): the six match tables against real Postgres. Idempotent writes (a
 * second upsert changes no row), alias relinking, merge repointing, player deletion, the unique keys,
 * anonymous REST denied on all six collections, hidden-player suppression through the read path, and
 * the end-to-end reconciliation of the seeded games against the season aggregates.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import { MATCH_COLUMN_KEYS, matchTables, type MatchTables } from '@/lib/match-store/db'
import { getMatchByGameId } from '@/lib/match-store/queries'
import { matchStoreStats, relinkMatchPlayers, upsertMatchBundle } from '@/lib/match-store/write'
import { isSkip, mapMatchBundle, type MatchBundle } from '@/lib/playhq/match-rows'
import type { RawGameSummary } from '@/lib/playhq/types'
import { generateMatchSeed, MATCH_SEED_HIDDEN_KEY } from '../../payload/scripts/fixtures/match-seed-data'
import { reconcileSeed, seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { resetMatches } from './match-helpers'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const TABLES = ['matches', 'match_innings', 'match_appearances', 'match_batting', 'match_bowling', 'match_fielding'] as const
const SLUGS = ['matches', 'match-innings', 'match-appearances', 'match-batting', 'match-bowling', 'match-fielding']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
let payload: Payload
let t: MatchTables
const db = () => payload.db.drizzle

beforeAll(async () => {
  payload = await getTestPayload()
  t = matchTables(payload)
})
afterAll(async () => {
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetMatches(payload)
})

const ctxFor = (raw: RawGameSummary) => ({
  clubOrgId: ORG, clubIds: new Set(raw.teams.filter((x) => x.organisation.id === ORG).map((x) => x.id)),
  seasonName: 'Summer 2025/26', seasonStartYear: 2025, competitionName: 'Seniors', isJunior: false,
  fixture: { updatedAt: '2025-10-26T01:00:00.000Z', venueSuburb: 'CLYDE', localDate: '2025-10-25', gradeId: null, gradeName: null, roundName: null, roundAbbr: null, isFinalRound: false },
})
const oneDayBundle = (mutate?: (raw: RawGameSummary) => void): MatchBundle => {
  const raw = JSON.parse(JSON.stringify(oneDay.data)) as RawGameSummary
  mutate?.(raw)
  const b = mapMatchBundle(raw, ctxFor(raw))
  if (isSkip(b)) throw new Error(b.skip)
  return b
}
const snapshot = async () => {
  const out: Record<string, unknown[]> = {}
  for (const name of TABLES) out[name] = await db().select().from(t[name]).orderBy(t[name].id)
  return out
}
const addPlayer = async (firstName: string, lastName: string, extra: Record<string, unknown> = {}) => {
  const stamp = new Date().toISOString()
  const [p] = await db()
    .insert(t.players)
    .values({ slug: `${firstName}-${lastName}`.toLowerCase(), firstName, lastName, displayName: `${firstName} ${lastName}`, source: 'manual', bio: '', manualYears: '', isActiveDerived: false, hidden: false, createdAt: stamp, updatedAt: stamp, ...extra })
    .returning({ id: t.players.id })
  await db().insert(t.player_aliases).values({ nameKey: `${firstName}|${lastName}`.toLowerCase(), player: p.id, createdAt: stamp, updatedAt: stamp })
  return p.id as number
}

describe('match store tables', () => {
  it('uses only drizzle column keys that exist (camelCase field names, not SQL names)', () => {
    for (const [table, keys] of Object.entries(MATCH_COLUMN_KEYS)) {
      expect(t[table as keyof MatchTables], table).toBeDefined()
      for (const k of keys) expect(t[table as keyof MatchTables][k], `${table}.${k}`).toBeDefined()
    }
    expect(t.match_appearances.name_key).toBeUndefined()
    expect(t.match_appearances.match_id).toBeUndefined()
  })

  it('writes a bundle and a second identical upsert changes no row and writes nothing', async () => {
    const bundle = oneDayBundle()
    expect(await upsertMatchBundle(payload, bundle, new Map())).toBe('created')
    const first = await snapshot()
    expect(first.matches).toHaveLength(1)
    expect(first.match_innings).toHaveLength(bundle.innings.length)
    expect(first.match_appearances).toHaveLength(bundle.appearances.length)
    expect(first.match_batting).toHaveLength(bundle.batting.length)
    expect(first.match_bowling).toHaveLength(bundle.bowling.length)
    expect(first.match_fielding).toHaveLength(bundle.fielding.length)
    await new Promise((r) => setTimeout(r, 15))
    expect(await upsertMatchBundle(payload, oneDayBundle(), new Map())).toBe('unchanged')
    expect(await snapshot()).toEqual(first) // ids, created_at and updated_at all identical
  })

  it('a new fixture stamp with identical rows only touches the match stamp columns', async () => {
    await upsertMatchBundle(payload, oneDayBundle(), new Map())
    const before = await snapshot()
    const later = oneDayBundle()
    later.match.playhqUpdatedAt = '2025-11-30T00:00:00.000Z'
    expect(await upsertMatchBundle(payload, later, new Map())).toBe('unchanged')
    const after = await snapshot()
    expect(after.match_batting).toEqual(before.match_batting)
    expect(after.match_appearances).toEqual(before.match_appearances)
    expect((after.matches[0] as { playhqUpdatedAt: string }).playhqUpdatedAt).toBe('2025-11-30T00:00:00.000Z')
    expect((after.matches[0] as { updatedAt: string }).updatedAt).toBe((before.matches[0] as { updatedAt: string }).updatedAt)
  })

  it('a corrected scorecard replaces the children wholesale and keeps the match id', async () => {
    await upsertMatchBundle(payload, oneDayBundle(), new Map())
    const before = await snapshot()
    const changed = oneDayBundle((raw) => {
      raw.periods[0].teams.find((x) => x.discipline === 'BATTING')!.appearances[0].statistics[0].value += 7
    })
    expect(await upsertMatchBundle(payload, changed, new Map())).toBe('updated')
    const after = await snapshot()
    expect((after.matches[0] as { id: number }).id).toBe((before.matches[0] as { id: number }).id)
    expect(after.match_batting).toHaveLength(before.match_batting.length)
    expect((after.match_batting[0] as { id: number }).id).not.toBe((before.match_batting[0] as { id: number }).id)
    const runs = (rows: unknown[]) => rows.map((r) => Number((r as { runs: number }).runs)).reduce((a, b) => a + b, 0)
    expect(runs(after.match_batting)).toBe(runs(before.match_batting) + 7)
  })

  it('an unresolved club row has a null player and relinks from nameKey once an alias exists; opposition rows never link', async () => {
    await upsertMatchBundle(payload, oneDayBundle(), new Map())
    const club = (await db().select().from(t.match_appearances)).filter((a: R) => a.isClubSide)
    expect(club.length).toBeGreaterThan(5)
    expect(club.every((a: R) => a.player === null)).toBe(true)
    const pick = club[0] as { nameKey: string; appearanceId: string }
    const [first, last] = pick.nameKey.split('|')
    const playerId = await addPlayer(first, last)
    expect(await relinkMatchPlayers(payload)).toBeGreaterThan(0)
    const rows = await db().select().from(t.match_appearances)
    expect(rows.find((a: R) => a.appearanceId === pick.appearanceId)!.player).toBe(playerId)
    expect(rows.filter((a: R) => !a.isClubSide).every((a: R) => a.player === null)).toBe(true)
    expect(await relinkMatchPlayers(payload)).toBe(0) // idempotent
  })

  it('deleting a player leaves its appearances with a null player, and relink restores them', async () => {
    const aliasMap = new Map<string, number>()
    const b = oneDayBundle()
    const key = b.appearances.find((a) => a.isClubSide)!.nameKey!
    const [first, last] = key.split('|')
    const oldId = await addPlayer(first, last)
    aliasMap.set(key, oldId)
    await upsertMatchBundle(payload, b, aliasMap)
    const linked = (await db().select().from(t.match_appearances)).filter((a: R) => a.player === oldId)
    expect(linked).toHaveLength(1)
    await db().execute(sql.raw(`DELETE FROM "payload"."player_aliases" WHERE player_id = ${oldId}; DELETE FROM "payload"."players" WHERE id = ${oldId}`))
    expect((await db().select().from(t.match_appearances)).filter((a: R) => a.player !== null)).toHaveLength(0)
    expect((await db().select().from(t.match_appearances)).filter((a: R) => a.nameKey === key)).toHaveLength(1) // identity survives in nameKey
    const newId = await addPlayer(first, last, { slug: 'replacement' })
    await relinkMatchPlayers(payload)
    expect((await db().select().from(t.match_appearances)).filter((a: R) => a.player === newId)).toHaveLength(1)
  })

  it('the unique keys reject duplicates', async () => {
    await upsertMatchBundle(payload, oneDayBundle(), new Map())
    const stamp = new Date().toISOString()
    const [m] = await db().select().from(t.matches)
    const [inn] = await db().select().from(t.match_innings)
    const [app] = await db().select().from(t.match_appearances)
    const [bat] = await db().select().from(t.match_batting)
    const before = await snapshot()
    await expect(db().insert(t.matches).values({ gameId: m.gameId, createdAt: stamp, updatedAt: stamp })).rejects.toThrow()
    await expect(db().insert(t.match_innings).values({ match: m.id, sequenceNo: inn.sequenceNo, createdAt: stamp, updatedAt: stamp })).rejects.toThrow()
    await expect(db().insert(t.match_appearances).values({ match: m.id, appearanceId: app.appearanceId, createdAt: stamp, updatedAt: stamp })).rejects.toThrow()
    await expect(db().insert(t.match_batting).values({ innings: bat.innings, match: m.id, appearanceId: bat.appearanceId, createdAt: stamp, updatedAt: stamp })).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })

  it('stats count every table', async () => {
    await upsertMatchBundle(payload, oneDayBundle(), new Map())
    const s = await matchStoreStats(payload)
    expect(s).toMatchObject({ matches: 1, innings: 2 })
    expect(s.batting).toBeGreaterThan(10)
    expect(s.lastSyncedAt).toBeTruthy()
  })
})

describe('access', () => {
  it('anonymous REST read of all six collections is denied; staff read works; nobody can write', async () => {
    await upsertMatchBundle(payload, oneDayBundle(), new Map())
    const editor = await tokenFor(payload, 'editor')
    const admin = await tokenFor(payload, 'admin')
    for (const slug of SLUGS) {
      expect({ slug, status: (await rest('GET', `/${slug}`)).status }).toEqual({ slug, status: 403 })
      expect([403, 404]).toContain((await rest('GET', `/${slug}/1`)).status)
      const staff = await rest('GET', `/${slug}?limit=1&depth=0`, { token: editor })
      expect({ slug, status: staff.status }).toEqual({ slug, status: 200 })
      expect(staff.json.docs.length).toBe(1)
      for (const token of [editor, admin]) {
        expect([401, 403]).toContain((await rest('POST', `/${slug}`, { token, body: {} })).status)
        expect([401, 403]).toContain((await rest('PATCH', `/${slug}/1`, { token, body: {} })).status)
        expect([401, 403]).toContain((await rest('DELETE', `/${slug}/1`, { token })).status)
      }
    }
    expect((await payload.count({ collection: 'matches', overrideAccess: true })).totalDocs).toBe(1)
  })
})

describe('seeded games', () => {
  it('seeds about 25 games through the real writer, idempotently, with a skipped abandoned game', async () => {
    const first = await seedMatchStore(payload, { clubOrgId: ORG })
    expect(first.games).toBeGreaterThanOrEqual(24)
    expect(first.created).toBe(first.games - 1)
    expect(first.skipped).toBe(1)
    expect((await matchStoreStats(payload)).matches).toBe(first.created)
    const before = await snapshot()
    const second = await seedMatchStore(payload, { clubOrgId: ORG })
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: first.created, players: 0, aliases: 0 })
    expect(await snapshot()).toEqual(before)
  })

  it('the stored rows reconcile with the season aggregates: zero mismatches for every player', async () => {
    await seedMatchStore(payload, { clubOrgId: ORG })
    const result = await reconcileSeed(payload, ORG)
    expect(result.mismatchedPlayers, JSON.stringify(result.samples)).toBe(0)
    expect(result).toMatchObject({ pairsCompared: 2, pairsSkipped: 0 })
    expect(result.playersCompared).toBeGreaterThan(20)
    expect(result.catchesSkippedSameName).toBeGreaterThan(0)
  })

  it('every club row is resolved to a player and the two-alias player is one player', async () => {
    await seedMatchStore(payload, { clubOrgId: ORG })
    const club = (await db().select().from(t.match_appearances)).filter((a: R) => a.isClubSide)
    expect(club.every((a: R) => a.player !== null)).toBe(true)
    const whitlock = club.filter((a: R) => a.nameKey.endsWith('|whitlock'))
    expect(new Set(whitlock.map((a: R) => a.nameKey)).size).toBe(2)
    expect(new Set(whitlock.map((a: R) => a.player)).size).toBe(1)
  })

  it('a hidden club player is kept out of match views, including inside dismissals', async () => {
    await seedMatchStore(payload, { clubOrgId: ORG })
    let sawSuppressed = false
    for (const g of generateMatchSeed(ORG)) {
      const m = await getMatchByGameId(g.raw.id)
      if (g.raw.status !== 'FINAL') {
        expect(m).toBeNull()
        continue
      }
      expect(m).not.toBeNull()
      const text = JSON.stringify(m)
      expect(text).not.toContain('Glover')
      expect(text).not.toContain('glover')
      if (text.includes('a club player')) sawSuppressed = true
      const hiddenAppearances = g.raw.appearances.filter((a) => `${a.firstName}|${a.lastName}`.toLowerCase() === MATCH_SEED_HIDDEN_KEY).map((a) => a.id)
      for (const inn of m!.innings) for (const r of [...inn.batting, ...inn.bowling, ...inn.fielding]) expect(hiddenAppearances).not.toContain(r.appearanceId)
    }
    expect(sawSuppressed).toBe(true)
  })

  it('getMatchByGameId returns the scorecard with names, dismissals and fall of wickets', async () => {
    await seedMatchStore(payload, { clubOrgId: ORG })
    expect(await getMatchByGameId('00000000-0000-0000-0000-000000000000')).toBeNull()
    const game = generateMatchSeed(ORG).find((g) => g.edge === 'two-day, four innings, declared')!
    const m = (await getMatchByGameId(game.raw.id))!
    expect(m.match).toMatchObject({ gameId: game.raw.id, type: 'twoDay', result: 'won' })
    expect(m.innings.map((i) => i.sequenceNo)).toEqual([1, 2, 3, 4])
    const batter = m.innings[0].batting.find((r) => r.status === 'out')!
    expect(batter.dismissal).toMatch(/^(b |c |lbw b |st |run out|hit wicket b |c & b )/)
    expect(batter.name).not.toBe('Unknown')
    expect(m.innings[0].batting.map((r) => r.position)).toEqual([...m.innings[0].batting.map((r) => r.position)].sort((a, b) => a - b))
  })

  it('merging two players repoints their appearances with one update and the names still resolve', async () => {
    await seedMatchStore(payload, { clubOrgId: ORG })
    const players = await db().select().from(t.players)
    const byName = (n: string) => players.find((p: R) => p.displayName === n)!
    const source = byName('Corey Ashby'), target = byName('Evan Brennan')
    const count = async (id: number) => (await db().select().from(t.match_appearances)).filter((a: R) => a.player === id).length
    const [s0, t0] = [await count(source.id), await count(target.id)]
    expect(s0).toBeGreaterThan(3)
    const gameId = generateMatchSeed(ORG).find((g) => g.raw.status === 'FINAL')!.raw.id
    const beforeText = JSON.stringify(await getMatchByGameId(gameId))
    const editor = await tokenFor(payload, 'editor')
    expect((await rest('POST', `/players/${source.id}/merge`, { token: editor, body: { targetId: target.id } })).status).toBe(200)
    expect(await count(source.id)).toBe(0)
    expect(await count(target.id)).toBe(s0 + t0)
    const afterText = JSON.stringify(await getMatchByGameId(gameId))
    expect(afterText).toBe(beforeText.replaceAll('Corey Ashby', 'Evan Brennan'))
  })
})
