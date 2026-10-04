/**
 * labels.int (W2 spec 6.3): grade and team label variants read as one, an admin rename changes the grade filters, records and
 * category everywhere the rows are read, stored rows never change, and an old shared `?grade=` link keeps working.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { playerTables } from '@/lib/players/db'
import { categoryOf, filterRows, gradeNames } from '@/lib/stats/leaderboard'
import { canonicalGrade } from '@/lib/stats/labels'
import { parseStatsParams } from '@/lib/stats/query-string'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetPlayers } from './players-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }))

let payload: Payload
const now = () => new Date().toISOString()

async function player(first: string, last: string) {
  const t = playerTables(payload)
  const [row] = await payload.db.drizzle
    .insert(t.players)
    .values({ slug: `${first}-${last}`.toLowerCase(), firstName: first, lastName: last, displayName: `${first} ${last}`, source: 'playhq', hidden: false, createdAt: now(), updatedAt: now() })
    .returning({ id: t.players.id })
  return row.id as number
}
async function row(playerId: number, teamName: string, gradeName: string, season = 'Summer 2025/26', order = 1) {
  const t = playerTables(payload)
  await payload.db.drizzle.insert(t.player_seasons).values({
    player: playerId, seasonName: season, seasonOrder: order, teamId: `${teamName}-${gradeName}-${season}`, teamName, gradeName, games: 5, batInnings: 5, batRuns: 100, source: 'playhq', createdAt: now(), updatedAt: now(),
  })
}
const stored = async () => (await payload.db.drizzle.execute(sql.raw('SELECT grade_name, team_name FROM "payload"."player_seasons" ORDER BY id'))).rows

beforeAll(async () => {
  payload = await getTestPayload()
  await resetGlobal(payload, 'site-settings')
  await resetPlayers(payload)
  const [a, b, c] = [await player('Alex', 'Demoson'), await player('Sam', 'Tester'), await player('Jo', 'Newplayer')]
  await row(a, 'Demo District', '2. Demo District')
  await row(b, 'Demo District', 'Demo District')
  await row(c, 'Demo District', 'Demo District')
  await row(a, 'Demo B', 'Demo B Grade', 'Summer 2024/25', 2)
  await row(b, 'Demo B', 'Demo B Grade', 'Summer 2024/25', 2)
  await row(c, 'Demo b', 'Demo B grade', 'Summer 2024/25', 2)
})
afterAll(async () => {
  await resetGlobal(payload, 'site-settings')
  await resetPlayers(payload)
  await destroyTestPayload(payload)
})

describe('label variants and renames', () => {
  it('reads numbering, case and spacing variants as one grade, without touching the stored rows', async () => {
    const before = await stored()
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    const data = await getVisibleStatData()
    expect(gradeNames(data.rows)).toEqual(['Demo B Grade', 'Demo District'])
    expect([...new Set(data.rows.map((r) => r.teamName))].sort()).toEqual(['Demo B', 'Demo District'])
    expect(await stored()).toEqual(before)
    expect(before.some((r) => r.grade_name === '2. Demo District')).toBe(true)
  })

  it('an admin rename changes the shown grade, the grade filter, the category and an old shared link', async () => {
    await payload.updateGlobal({ slug: 'site-settings', data: { stats: { labelRenames: [{ kind: 'grade', from: 'Demo B Grade', to: 'Demo Under 14 Girls' }] } }, context: { disableRevalidate: true } })
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    const { getLabelMap } = await import('@/lib/stats/label-queries')
    const data = await getVisibleStatData()
    expect(gradeNames(data.rows)).toEqual(['Demo District', 'Demo Under 14 Girls'])
    // The category follows the rename: the renamed grade is now a junior grade and leaves the senior default.
    const renamed = data.rows.filter((r) => r.gradeName === 'Demo Under 14 Girls')
    expect(renamed).toHaveLength(3)
    expect(renamed.every((r) => categoryOf(r, []) === 'junior')).toBe(true)
    expect(filterRows(data.rows, { cats: ['senior'], rules: [] }).every((r) => r.gradeName === 'Demo District')).toBe(true)
    expect(filterRows(data.rows, { cats: ['senior', 'junior'], rules: [], grade: 'Demo Under 14 Girls' })).toHaveLength(3)
    // The old spelling in a shared link still resolves, and so does the pre-rename lower-case variant.
    const labels = await getLabelMap()
    const known = { seasons: data.seasons.map((s) => s.seasonName), grades: gradeNames(data.rows), canonicalGrade: (raw: string) => canonicalGrade(raw, labels) }
    expect(parseStatsParams({ grade: 'Demo B Grade' }, known).grade).toBe('Demo Under 14 Girls')
    expect(parseStatsParams({ grade: 'demo b grade' }, known).grade).toBe('Demo Under 14 Girls')
    expect(parseStatsParams({ grade: '2. Demo District' }, known).grade).toBe('Demo District')
    expect(parseStatsParams({ grade: 'No such grade' }, known).grade).toBe('all')
    // Stored rows are still the PlayHQ spellings.
    expect((await stored()).some((r) => r.grade_name === 'Demo B Grade')).toBe(true)
  })

  it('a team rename applies to team names', async () => {
    await payload.updateGlobal({ slug: 'site-settings', data: { stats: { labelRenames: [{ kind: 'team', from: 'Demo District', to: 'Demo Firsts' }] } }, context: { disableRevalidate: true } })
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    const data = await getVisibleStatData()
    expect(new Set(data.rows.filter((r) => r.gradeName === 'Demo District').map((r) => r.teamName))).toEqual(new Set(['Demo Firsts']))
  })

  it('removing the renames restores the tidy-up only', async () => {
    await payload.updateGlobal({ slug: 'site-settings', data: { stats: { labelRenames: [] } }, context: { disableRevalidate: true } })
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    expect(gradeNames((await getVisibleStatData()).rows)).toEqual(['Demo B Grade', 'Demo District'])
  })
})
