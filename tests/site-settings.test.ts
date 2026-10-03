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
