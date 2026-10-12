import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/payload/client', () => ({
  getPayloadClient: async () => ({
    find: async () => ({ docs: [{ id: 1, displayName: 'Grade-only Junior', slug: 'grade-only-junior', isJunior: false, socialOptIn: false }] }),
  }),
}))
vi.mock('@/lib/site-settings', () => ({ getStatsSettings: async () => ({ gradeRules: [] }) }))
vi.mock('@/lib/club', () => ({ getClub: async () => ({ name: 'Club', shortName: 'Club', siteUrl: 'https://example.org' }) }))
vi.mock('@/lib/stats/queries', () => ({ getVisibleStatData: vi.fn() }))
vi.mock('@/lib/theme', () => ({ getTheme: async () => ({}) }))
vi.mock('@/lib/theme/fonts-server', () => ({ loadThemeFonts: async () => [] }))
vi.mock('next/og', () => ({ ImageResponse: class {} }))

describe('junior rule when statistics cannot be read', () => {
  it('makes nobody eligible instead of falling back to the permissive default', async () => {
    const { getVisibleStatData } = await import('@/lib/stats/queries')
    vi.mocked(getVisibleStatData).mockRejectedValue(new Error('stats are down'))
    const { loadSocialPlayers } = await import('@/lib/social/sources/shared')
    const players = await loadSocialPlayers('2026-10-12')
    expect(players.size).toBe(0)
  })
})

describe('image fetch does not follow redirects', () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://club.example'
    delete process.env.VERCEL_ENV
  })
  afterEach(() => {
    process.env = { ...env }
    vi.unstubAllGlobals()
  })

  it('asks fetch to refuse redirects, and skips an image whose fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('redirect mode is set to error'))
    vi.stubGlobal('fetch', fetchMock)
    const { loadImageDataUri } = await import('@/lib/theme/og')
    const out = await loadImageDataUri('/media/logo.png', 'redirect-test')
    expect(out).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })
})

describe('leaders chooser', () => {
  it('lists only the choices that would draw someone', async () => {
    vi.resetModules()
    vi.doMock('@/lib/stats/queries', () => ({ getVisibleStatData: async () => ({ rows: [], seasons: [], players: new Map() }) }))
    vi.doMock('@/lib/stats/season-window', () => ({ currentSeasonName: () => '2026/27', shortSeason: (s: string) => s }))
    vi.doMock('@/lib/site-settings', () => ({ getStatsSettings: async () => ({ gradeRules: [], defaultIncludedCategories: ['senior'] }) }))
    vi.doMock('@/lib/social/sources/shared', () => ({
      clubToday: () => '2026-10-12',
      loadSocialPlayers: async () => new Map([[1, { id: 1, slug: 'a', name: 'A', eligible: true }], [2, { id: 2, slug: 'j', name: 'J', eligible: false }]]),
    }))
    // Runs and wickets have a leader only over all seasons; games has one this season too (and a junior is ranked first, so is skipped).
    vi.doMock('@/lib/stats/leaderboard', () => ({
      boardContext: () => ({ text: () => '', label: '' }),
      buildLeaderboard: (_rows: unknown, p: { season: string; metric: string }) => ({
        result: { ranked: p.metric === 'games' || p.season === 'all' ? [{ item: { playerId: 2 } }, { item: { playerId: 1 } }] : p.metric === 'catches' ? [{ item: { playerId: 2 } }] : [] },
      }),
    }))
    vi.doMock('@/lib/stats/query-string', () => ({ ALL: 'all' }))
    const { leadersChoices } = await import('@/lib/social/sources/stats')
    const { choices } = await leadersChoices()
    const ids = choices.map((c) => c.id)
    expect(ids).toContain('games|2026/27|default|5')
    expect(ids).toContain('runs|all|default|5')
    expect(ids).not.toContain('runs|2026/27|default|5')
    expect(ids).not.toContain('wickets|2026/27|default|5')
    // Only a junior would lead: nothing to draw.
    expect(ids.some((i) => i.startsWith('catches|2026/27'))).toBe(false)
  })
})
