import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import seasons from '../fixtures/playhq/seasons.json'
import seniorTeams from '../fixtures/playhq/teams-senior-2025-26.json'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import { findClubTeam, getGameSummaryAuto } from '@/lib/playhq/queries'

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const LL_B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const GAME = twoDay.data.id
const SENIOR_2526 = '04518c8e-79eb-4aeb-b126-3abc395c8902'
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
const empty = { data: [], metadata: { hasMore: false, nextCursor: null } }

/** Fetch stub keyed on path. `teamsBySeason` maps season id → teams payload; unknown seasons return no teams. */
function stubFetch(opts: { teamsBySeason?: Record<string, unknown> } = {}) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(url)
    const path = url.replace('https://api.playhq.com', '')
    if (path.endsWith('/seasons')) return json(seasons)
    const m = /^\/v1\/seasons\/([^/]+)\/teams/.exec(path)
    if (m) return json(opts.teamsBySeason?.[m[1]] ?? empty)
    if (path === `/v2/games/${GAME}/summary`) return json(twoDay)
    return json({ error: 'nope' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

const fullSurnames = () =>
  [...new Set(twoDay.data.appearances.map((a) => a.lastName))].filter((l) => l.length > 1)

describe('findClubTeam', () => {
  beforeEach(() => { process.env.PLAYHQ_CLIENT_ID = 'k' })
  afterEach(() => vi.unstubAllGlobals())

  it('tries the hinted season group first', async () => {
    const calls = stubFetch({ teamsBySeason: { [SENIOR_2526]: seniorTeams } })
    const found = await findClubTeam(LL_B, 'Summer 2025/26')
    expect(found?.team.name).toBe('Lang Lang B Grade')
    expect(found?.season.name).toBe('Summer 2025/26')
    expect(found?.team.isJunior).toBe(false)
    // only the hinted group's seasons were fetched (4 comps in 2025/26), none from 2026/27
    const teamCalls = calls.filter((u) => u.includes('/teams'))
    expect(teamCalls.length).toBe(4)
    expect(teamCalls.some((u) => u.includes('e92eb6d6-4821-4b99-a0cb-98b95fe3aa1b'))).toBe(false)
  })

  it('falls back to scanning every group when the hint is wrong or missing', async () => {
    stubFetch({ teamsBySeason: { [SENIOR_2526]: seniorTeams } })
    expect((await findClubTeam(LL_B, 'Summer 1999/00'))?.season.name).toBe('Summer 2025/26')
    expect((await findClubTeam(LL_B))?.season.name).toBe('Summer 2025/26')
    expect(await findClubTeam('not-a-team', 'Summer 2025/26')).toBeNull()
  })
})

describe('getGameSummaryAuto junior policy', () => {
  beforeEach(() => { process.env.PLAYHQ_CLIENT_ID = 'k' })
  afterEach(() => vi.unstubAllGlobals())

  it('senior club team resolvable → full names', async () => {
    stubFetch({ teamsBySeason: { [SENIOR_2526]: seniorTeams } })
    const sc = await getGameSummaryAuto(GAME, 'Summer 2025/26')
    expect(sc).not.toBeNull()
    const text = JSON.stringify(sc!.innings).toLowerCase()
    expect(fullSurnames().some((l) => text.includes(l.toLowerCase()))).toBe(true)
  })

  it('club team unresolvable → fails closed to abbreviated names', async () => {
    stubFetch()   // every teams endpoint returns no club teams
    const sc = await getGameSummaryAuto(GAME, 'Summer 2025/26')
    expect(sc).not.toBeNull()
    const text = JSON.stringify(sc!.innings).toLowerCase()
    for (const l of fullSurnames()) expect(text, `surname ${l} leaked`).not.toContain(l.toLowerCase())
    expect(sc!.innings[1].batting[0].name).toMatch(/^\S+ \S\.$/)
  })

  it('returns null when no club side is playing', async () => {
    const other = { data: { ...twoDay.data, teams: twoDay.data.teams.map((t) => ({ ...t, organisation: { id: 'x', name: 'x' } })) } }
    vi.stubGlobal('fetch', vi.fn(async () => json(other)))
    expect(await getGameSummaryAuto(GAME)).toBeNull()
  })
})
