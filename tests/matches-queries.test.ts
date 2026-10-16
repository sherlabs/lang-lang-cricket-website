import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bGrade from './fixtures/playhq/team-fixture-b-grade-2025-26.json'
import oneDay from './fixtures/playhq/team-fixture-one-day-2025-26.json'
import seasons from './fixtures/playhq/seasons.json'
import seniorTeams from './fixtures/playhq/teams-senior-2025-26.json'
import { NARROW_THRESHOLD, ROUNDS_PER_PAGE, buildMatchView, filterGames, groupByRound, loadSeasonGames, matchGrades, parseMatchParams, resultOf } from '@/lib/matches-queries'
import { mapGame } from '@/lib/playhq/games'
import type { Game, RawFixtureGame } from '@/lib/playhq/types'

const B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const OD = '4398ce96-6b78-48af-8623-c208f8ceca9f'
const SENIOR_2526 = '04518c8e-79eb-4aeb-b126-3abc395c8902'
const ids = new Set([B, OD])
const map = (raw: unknown) => (raw as { data: RawFixtureGame[] }).data.map((g) => mapGame(g, ids)!).filter(Boolean)
const bGames = map(bGrade)
const odGames = map(oneDay)
const all = [...bGames, ...odGames]

describe('parseMatchParams', () => {
  const grades = ['4. Senior Men B Grade']
  it('keeps known values and defaults the rest', () => {
    expect(parseMatchParams({ grade: grades[0], q: ' nar ', result: 'won', page: '3' }, grades)).toEqual({ grade: grades[0], q: 'nar', result: 'won', page: 3 })
    expect(parseMatchParams({ grade: 'nope', result: 'x', page: '-4' }, grades)).toEqual({ grade: null, q: '', result: 'all', page: 1 })
    expect(parseMatchParams({ page: '1.5' }, grades).page).toBe(1)
    expect(parseMatchParams({ q: 'x'.repeat(81) }, grades).q).toBe('')
    expect(parseMatchParams({ grade: [grades[0], 'other'] }, grades).grade).toBe(grades[0])
  })
})

describe('filtering', () => {
  it('only finished games, newest-first by round, and every row links by id', () => {
    const view = buildMatchView(all, { grade: null, q: '', result: 'all', page: 1 })
    expect(view.total).toBe(all.filter((g) => g.status === 'FINAL' || g.status === 'ABANDONED').length)
    expect(view.rounds.length).toBeLessThanOrEqual(ROUNDS_PER_PAGE)
    expect(view.narrowed).toBe(false)
  })

  it('filters by grade, opponent substring and result', () => {
    const grades = matchGrades(all)
    expect(grades.length).toBeGreaterThanOrEqual(2)
    const b = filterGames(all, { grade: bGames[0].gradeName, q: '', result: 'all' })
    expect(b.every((g) => g.gradeName === bGames[0].gradeName)).toBe(true)
    const nng = filterGames(all, { grade: null, q: 'nar nar', result: 'all' })
    expect(nng.length).toBeGreaterThan(0)
    expect(nng.every((g) => g.opponent.name.toLowerCase().includes('nar nar'))).toBe(true)
    const won = filterGames(all, { grade: null, q: '', result: 'won' })
    const lost = filterGames(all, { grade: null, q: '', result: 'lost' })
    const other = filterGames(all, { grade: null, q: '', result: 'other' })
    expect(won.length + lost.length + other.length).toBe(filterGames(all, { grade: null, q: '', result: 'all' }).length)
    expect(won.every((g) => resultOf(g) === 'won')).toBe(true)
  })

  it('counts an abandoned game as other', () => {
    const ab = bGames.find((g) => g.status === 'ABANDONED')!
    expect(resultOf(ab)).toBe('other')
  })
})

describe('groupByRound and paging', () => {
  it('orders rounds newest first and games within a round newest first', () => {
    const groups = groupByRound(bGames.filter((g) => g.status === 'FINAL'))
    const newest = groups.map((g) => g.games[0].sortKey)
    expect([...newest].sort().reverse()).toEqual(newest)
  })

  it('pages by rounds and clamps an out-of-range page', () => {
    const f = { grade: bGames[0].gradeName, q: '', result: 'all' as const }
    const p1 = buildMatchView(bGames, { ...f, page: 1 })
    expect(p1.pages).toBe(Math.ceil(groupByRound(filterGames(bGames, f)).length / ROUNDS_PER_PAGE))
    expect(p1.rounds).toHaveLength(ROUNDS_PER_PAGE)
    const last = buildMatchView(bGames, { ...f, page: 99 })
    expect(last.page).toBe(p1.pages)
    expect(last.rounds.length).toBeGreaterThan(0)
  })

  it('shows only the first page of rounds for a big season with no grade, and pages normally once a grade is chosen', () => {
    const big: Game[] = Array.from({ length: NARROW_THRESHOLD + 5 }, (_, i) => ({
      ...bGames[0], id: `g${i}`, roundName: `Round ${i + 1}`, sortKey: `2025-10-${String((i % 28) + 1).padStart(2, '0')}T13:00:00`, status: 'FINAL', gradeName: i % 2 ? 'A' : 'B',
    }))
    const wide = buildMatchView(big, { grade: null, q: '', result: 'all', page: 4 })
    expect(wide.narrowed).toBe(true)
    expect(wide.page).toBe(1)
    expect(wide.pages).toBe(1)
    expect(wide.rounds).toHaveLength(ROUNDS_PER_PAGE)
    const graded = buildMatchView(big, { grade: 'A', q: '', result: 'all', page: 4 })
    expect(graded.narrowed).toBe(false)
    expect(graded.page).toBe(4)
  })
})

describe('loadSeasonGames', () => {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
  const empty = { data: [], metadata: { hasMore: false, nextCursor: null } }
  beforeEach(() => { process.env.PLAYHQ_CLIENT_ID = 'k' })
  afterEach(() => vi.unstubAllGlobals())

  it('loads the season group and the club games from the fixtures', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = url.replace('https://api.playhq.com', '')
      if (path.endsWith('/seasons')) return json(seasons)
      if (path.startsWith(`/v1/seasons/${SENIOR_2526}/teams`)) return json(seniorTeams)
      if (/^\/v1\/seasons\/[^/]+\/teams/.test(path)) return json(empty)
      if (path.startsWith(`/v1/teams/${B}/fixture`)) return json(bGrade)
      if (path.startsWith(`/v1/teams/${OD}/fixture`)) return json(oneDay)
      return json(empty)
    }))
    const loaded = await loadSeasonGames('Summer 2025/26')
    expect(loaded.season.name).toBe('Summer 2025/26')
    expect(loaded.games.length).toBeGreaterThan(10)
    expect(loaded.games.every((g) => g.id)).toBe(true)
  })

  it('rejects when PlayHQ is unreachable, so the page can show the unavailable note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'down' }, 503)))
    await expect(loadSeasonGames(undefined)).rejects.toThrow()
  })
})
