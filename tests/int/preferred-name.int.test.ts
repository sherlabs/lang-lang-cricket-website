/**
 * preferred-name.int (W2 spec 6.3): a preferred name changes what visitors see and nothing about identity. The slug does not
 * move, no alias is created, a sync leaves it alone, and every name read shows it.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import { destroyTestPayload, getTestPayload } from './helpers'
import { resetPlayers } from './players-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }))

const B_GRADE = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const ONE_DAY_TEAM = '4398ce96-6b78-48af-8623-c208f8ceca9f'
vi.mock('@/lib/playhq/queries', async () => {
  const group = (name: string, id: string) => ({ name, isJunior: false, status: 'COMPLETED', seasons: [{ id, status: 'COMPLETED', competitionName: 'Seniors', isJunior: false }] })
  const team = (id: string, name: string, gradeName: string) => ({ id, name, seasonId: 's', seasonName: 's', competitionName: 'Seniors', isJunior: false, gradeId: 'g', gradeName })
  return {
    getSeasonGroups: vi.fn(async () => [group('Summer 2026/27', 's0'), group('Summer 2025/26', 's1'), group('Summer 2024/25', 's2')]),
    getClubTeams: vi.fn(async (g: { seasons: { id: string }[] }) => {
      const id = g.seasons[0].id
      return id === 's1' ? [team(B_GRADE, 'Lang Lang B Grade', 'B Grade')] : id === 's2' ? [team(ONE_DAY_TEAM, 'Lang Lang One Day', 'One Day')] : []
    }),
    getTeamGames: vi.fn(async (t: { id: string }) => [{ id: t.id === B_GRADE ? twoDay.data.id : oneDay.data.id, status: 'FINAL', updatedAt: '2025-11-02T00:00:00.000Z' }]),
    getRawGameSummary: vi.fn(async (id: string) => JSON.parse(JSON.stringify(id === twoDay.data.id ? twoDay.data : oneDay.data))),
    isJuniorGrade: vi.fn(() => false),
  }
})

let payload: Payload
const ctx = { disableRevalidate: true }
beforeAll(async () => {
  payload = await getTestPayload()
})
afterAll(async () => {
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetPlayers(payload)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
const rows = (table: string) => payload.db.drizzle.execute(sql.raw(`SELECT * FROM "payload"."${table}" ORDER BY id`)).then((r) => r.rows as Record<string, unknown>[])

describe('preferred name', () => {
  it('shows instead of the full name, never changes the slug, and is absent from the aliases', async () => {
    const p = await payload.create({ collection: 'players', data: { firstName: 'Jonathan', lastName: 'Smith' }, context: ctx })
    expect(p).toMatchObject({ slug: 'jonathan-smith', displayName: 'Jonathan Smith' })
    const named = await payload.update({ collection: 'players', id: p.id, data: { preferredName: '  Chook  ' }, context: ctx })
    expect(named).toMatchObject({ slug: 'jonathan-smith', displayName: 'Chook', preferredName: 'Chook' })
    // A later edit of the real name keeps the preferred name showing; the slug still does not move.
    const renamed = await payload.update({ collection: 'players', id: p.id, data: { lastName: 'Smythe' }, context: ctx })
    expect(renamed).toMatchObject({ slug: 'jonathan-smith', displayName: 'Chook' })
    expect((await rows('player_aliases')).map((a) => a.name_key)).toEqual([])
    // Cleared, the full name returns.
    const cleared = await payload.update({ collection: 'players', id: p.id, data: { preferredName: '' }, context: ctx })
    expect(cleared.displayName).toBe('Jonathan Smythe')
  })

  it('every name read shows it: stats, profile lists, match names', async () => {
    const p = await payload.create({ collection: 'players', data: { firstName: 'Jonathan', lastName: 'Smith', preferredName: 'Chook' }, context: ctx })
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    const t = (await import('@/lib/players/db')).playerTables(payload)
    await payload.db.drizzle.insert(t.player_seasons).values({ player: p.id, seasonName: 'Summer 2025/26', seasonOrder: 1, teamId: 'x', teamName: 'x', games: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    const data = await getVisibleStatData()
    expect(data.players.get(p.id)?.name).toBe('Chook')
    const { getMilestonePlayers } = await import('@/lib/stats/queries')
    expect((await getMilestonePlayers()).find((m) => m.id === p.id)?.name).toBe('Chook')
    const { getPlayerProfile } = await import('@/lib/players/queries')
    expect((await getPlayerProfile('jonathan-smith'))?.name).toBe('Chook')
  })

  it('survives a sync and is not used as an alias key', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    expect((await syncPlayers(payload)).status).toBe('ok')
    const [first] = (await rows('players')).filter((x) => x.source === 'playhq')
    const aliasesBefore = (await rows('player_aliases')).map((a) => a.name_key)
    await payload.update({ collection: 'players', id: Number(first.id), data: { preferredName: 'Nickname Test' }, context: ctx })
    expect((await syncPlayers(payload)).status).toBe('ok')
    const after = (await rows('players')).find((x) => x.id === first.id)!
    expect(after).toMatchObject({ preferred_name: 'Nickname Test', display_name: 'Nickname Test', slug: first.slug })
    expect((await rows('player_aliases')).map((a) => a.name_key)).toEqual(aliasesBefore)
    expect((await rows('player_aliases')).map((a) => a.name_key)).not.toContain('nickname test')
  })
})
