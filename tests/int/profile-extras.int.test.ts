import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_STATS_SETTINGS } from '@/lib/site-settings-core'
import { RESERVED_SLUGS } from '@/lib/slugify'
import { filterRows } from '@/lib/stats/leaderboard'
import { buildHonourBoard } from '@/lib/stats/honours'
import { buildMilestoneBoard } from '@/lib/stats/milestones'
import { coverage, currentSeasonName } from '@/lib/stats/season-window'
import { PLANTED } from '@/payload/scripts/fixtures/stats-seed-data'
import { seedStats } from '@/payload/scripts/fixtures/stats-seed-db'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetPlayers } from './players-helpers'

// WP-B queries and rules against the seeded langlang_test DB.
describe('profile extras, compare, honours and milestones data', () => {
  let payload: Payload
  const CTX = { disableRevalidate: true } as const
  const config = { thresholds: DEFAULT_STATS_SETTINGS.milestoneThresholds, window: DEFAULT_STATS_SETTINGS.approachWindow }

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

  it('the compare pickers (visible stat data) never list a hidden player', async () => {
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    const slugs = [...(await getVisibleStatData()).players.values()].map((p) => p.slug)
    for (const h of PLANTED.hidden) expect(slugs).not.toContain(h)
    expect(slugs).toContain(PLANTED.careerLeader.slug)
  })

  it('the honour query excludes hidden players and groups the seeded honours', async () => {
    const { getHonourPlayers } = await import('@/lib/stats/queries')
    const players = await getHonourPlayers()
    expect(players.some((p) => p.honours.some((h) => h.title.includes('Hidden Honour')))).toBe(false)
    const board = buildHonourBoard(players, DEFAULT_STATS_SETTINGS.honourCategories)
    const life = board.byHonour.find((g) => g.key === 'life member')!
    expect(life.category).toBe('Life Member')
    expect(life.recipients.map((r) => r.slug)).toContain(PLANTED.veteran.slug)
    // seeded titles carry stray spaces and varied case: they still group
    expect(board.byHonour.filter((g) => g.key === g.key.trim().toLowerCase()).length).toBe(board.byHonour.length)
    expect(board.byYear.at(-1)!.label).toMatch(/not recorded|^\d{4}$/)
  })

  it('milestones: the 99-game player is approaching 100, the veteran is not, a crosser has a season', async () => {
    const { getMilestonePlayers, getVisibleStatData } = await import('@/lib/stats/queries')
    const [data, players] = await Promise.all([getVisibleStatData(), getMilestonePlayers()])
    const rows = filterRows(data.rows, { cats: DEFAULT_STATS_SETTINGS.defaultIncludedCategories, rules: DEFAULT_STATS_SETTINGS.gradeRules })
    const board = buildMilestoneBoard({
      players, rows, windowStart: coverage(data.rows)?.from ?? null, currentSeason: currentSeasonName(rows), onlyActive: false, config,
    })
    const near = board.approaching.find((a) => a.slug === PLANTED.nearMilestone.slug && a.key === 'games')
    expect(near).toMatchObject({ threshold: 100, remaining: 1, current: 99 })
    expect(board.approaching.some((a) => a.slug === PLANTED.veteran.slug)).toBe(false)
    expect(board.approaching.some((a) => PLANTED.hidden.includes(a.slug as never))).toBe(false)

    const { milestonesFor } = await import('@/lib/stats/milestones')
    const { mergeBySeason } = await import('@/lib/stats/aggregate')
    const leader = [...data.players.values()].find((p) => p.slug === PLANTED.careerLeader.slug)!
    const m = milestonesFor({ seasons: mergeBySeason(rows.filter((r) => r.playerId === leader.id)), windowStart: 'Summer 2023/24', config })
    expect(m.achieved.find((a) => a.key === 'runs' && a.threshold === 2000)).toMatchObject({ reachedIn: '2025/26' })
  })

  it('the admin milestone query still includes hidden players; the public one does not', async () => {
    const { getAllMilestonePlayersForAdmin, getMilestonePlayers } = await import('@/lib/stats/queries')
    expect((await getAllMilestonePlayersForAdmin()).some((p) => p.slug === PLANTED.hidden[0])).toBe(true)
    expect((await getMilestonePlayers()).some((p) => p.slug === PLANTED.hidden[0])).toBe(false)
  })

  it('stores a pre-PlayHQ baseline and feeds it to the milestone query', async () => {
    const { getMilestonePlayers } = await import('@/lib/stats/queries')
    const veteran = (await getMilestonePlayers()).find((p) => p.slug === PLANTED.veteran.slug)!
    expect(veteran.baseline).toEqual({ games: 0, runs: 0, wickets: 0, catches: 0 })
    await payload.update({ collection: 'players', id: veteran.id, data: { baselineGames: 60 }, context: CTX })
    const after = (await getMilestonePlayers()).find((p) => p.slug === PLANTED.veteran.slug)!
    expect(after.baseline.games).toBe(60)
  })

  it('a player named "Compare" never takes the reserved /players/compare slug', async () => {
    const created = await payload.create({ collection: 'players', data: { firstName: 'Compare', lastName: '', source: 'manual', bio: '[seed] reserved slug' }, context: CTX })
    expect(created.slug).toBe('compare-2')
    const { docs } = await payload.find({ collection: 'players', pagination: false, depth: 0, joins: false, select: { slug: true } })
    expect(docs.filter((d) => RESERVED_SLUGS.has(d.slug ?? ''))).toEqual([])
  })
})
