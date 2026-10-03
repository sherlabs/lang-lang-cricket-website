import { describe, it, expect } from 'vitest'

// Pure split (spec §15 ADAPT): no database, no Payload. The global read is covered by site-settings.int.

describe('normaliseTiers', () => {
  it('returns null for anything that is not a list', async () => {
    const { normaliseTiers } = await import('@/lib/site-settings-core')
    expect(normaliseTiers(undefined)).toBeNull()
    expect(normaliseTiers(null)).toBeNull()
    expect(normaliseTiers('Gold')).toBeNull()
    expect(normaliseTiers({ tiers: ['Gold'] })).toBeNull()
  })

  it('keeps an empty list as an explicit "show nothing"', async () => {
    const { normaliseTiers } = await import('@/lib/site-settings-core')
    expect(normaliseTiers([])).toEqual([])
  })

  it('drops unknown and non-string entries', async () => {
    const { normaliseTiers } = await import('@/lib/site-settings-core')
    expect(normaliseTiers(['Gold', 'Diamond', 42, null, 'gold'])).toEqual(['Gold'])
  })

  it('dedupes and orders by tier rank', async () => {
    const { normaliseTiers } = await import('@/lib/site-settings-core')
    expect(normaliseTiers(['Bronze', 'Platinum', 'Gold', 'Platinum'])).toEqual(['Platinum', 'Gold', 'Bronze'])
  })
})

describe('selectCarouselSponsors', () => {
  const row = (id: number, tier: string, name: string, logoUrl = `/${id}.png`) => ({
    id,
    tier,
    name,
    logoUrl,
    linkUrl: '',
  })

  it('filters to the chosen tiers, orders by tier then name and shows a business once', async () => {
    const { selectCarouselSponsors } = await import('@/components/sponsor-carousel')
    const rows = [
      row(1, 'Silver', 'Zed Plumbing'),
      row(2, 'Gold', 'Beta Bakery'),
      row(3, 'Platinum', 'Community Bank'),
      row(4, 'Gold', 'Alpha Autos'),
      row(5, 'Gold', 'community bank '), // same business, lower tier
      row(6, 'Gold', 'No Logo Co', ''),
    ]
    expect(selectCarouselSponsors(rows, ['Platinum', 'Gold']).map((s) => s.id)).toEqual([3, 4, 2])
  })

  it('returns nothing when no tiers are selected', async () => {
    const { selectCarouselSponsors } = await import('@/components/sponsor-carousel')
    expect(selectCarouselSponsors([row(1, 'Gold', 'A')], [])).toEqual([])
  })
})

describe('resolveStatsSettings', () => {
  it('returns the defaults for anything that is not an object', async () => {
    const { resolveStatsSettings, DEFAULT_STATS_SETTINGS } = await import('@/lib/site-settings-core')
    expect(resolveStatsSettings(undefined)).toEqual(DEFAULT_STATS_SETTINGS)
    expect(resolveStatsSettings('nope')).toEqual(DEFAULT_STATS_SETTINGS)
    expect(DEFAULT_STATS_SETTINGS.defaultIncludedCategories).toEqual(['senior', 'womens', 'masters', 'mixed'])
    expect(DEFAULT_STATS_SETTINGS.qualification.career.batAvgRuns).toBe(300)
    expect(DEFAULT_STATS_SETTINGS.milestoneThresholds.games).toEqual([50, 100, 150, 200, 250])
  })

  it('keeps valid saved values and falls back per field', async () => {
    const { resolveStatsSettings } = await import('@/lib/site-settings-core')
    const s = resolveStatsSettings({
      defaultIncludedCategories: ['junior', 'senior', 'bogus'],
      qualification: { career: { batAvgRuns: 150, batAvgInnings: -3 } },
      milestoneThresholds: { games: [100, 50, 50, -1, 'x'], runs: [] },
      approachWindow: { games: 9, runs: 'lots' },
    })
    expect(s.defaultIncludedCategories).toEqual(['senior', 'junior'])
    expect(s.qualification.career.batAvgRuns).toBe(150)
    expect(s.qualification.career.batAvgInnings).toBe(8)
    expect(s.qualification.season.batAvgRuns).toBe(100)
    expect(s.milestoneThresholds.games).toEqual([50, 100])
    expect(s.milestoneThresholds.runs).toEqual([500, 1000, 2000, 3000, 5000])
    expect(s.approachWindow).toMatchObject({ games: 9, runs: 100 })
  })

  it('drops invalid grade rules and an empty category selection', async () => {
    const { resolveStatsSettings, DEFAULT_INCLUDED_CATEGORIES } = await import('@/lib/site-settings-core')
    const s = resolveStatsSettings({
      defaultIncludedCategories: [],
      gradeRules: [{ category: 'mixed', pattern: 'social' }, { category: 'mixed', pattern: '(' }, { category: 'nope', pattern: 'x' }],
    })
    expect(s.defaultIncludedCategories).toEqual(DEFAULT_INCLUDED_CATEGORIES)
    expect(s.gradeRules.map((r) => r.pattern)).toEqual(['social'])
  })
})
