import { describe, expect, it } from 'vitest'
import { mergeOver, resolveClub } from '@/lib/club-merge'
import { clubDefaults, clubGlobalSeed } from '@/payload/seed/club-defaults'

describe('resolveClub (spec §4.1: the global merged over the defaults module)', () => {
  it('a never-saved global yields the defaults verbatim, with static asset fallbacks', () => {
    const club = resolveClub({ id: 1, globalType: 'club', socials: [], pages: {} })
    expect(club.name).toBe('Lang Lang Cricket Club')
    expect(club.socials).toEqual(clubDefaults.socials)
    expect(club.logoUrl).toBe('/assets/branding/logo.png')
    expect(club.ogImage).toEqual({ url: '/og-image.jpg', width: 1200, height: 630 })
    expect(club.sameAs).toEqual([])
    expect(club.home).toBe(clubDefaults.home)
  })

  it('the seeded global resolves to exactly the defaults', () => {
    const seeded = { ...clubGlobalSeed(), id: 1, updatedAt: '2026-10-03T00:00:00.000Z', logo: null, ogImage: null }
    const club = resolveClub(seeded)
    for (const key of Object.keys(clubDefaults) as (keyof typeof clubDefaults)[]) {
      expect(club[key], key).toEqual(clubDefaults[key])
    }
  })

  it('saved values win; null keeps the default; upload relations become URLs', () => {
    const club = resolveClub({
      updatedAt: '2026-10-03T00:00:00.000Z',
      name: 'Other CC',
      tagline: null,
      siteUrl: 'https://other.example/',
      address: { locality: 'Elsewhere', region: null },
      socials: [{ id: 'x1', platform: 'instagram', url: 'https://instagram.com/other', label: 'Instagram' }],
      logo: { id: 3, url: 'https://store.public.blob.vercel-storage.com/logo.png', width: 10, height: 10 },
      ogImage: 7, // unpopulated id: fall back
    })
    expect(club.name).toBe('Other CC')
    expect(club.tagline).toBe('Caldermeade, Victoria')
    expect(club.siteUrl).toBe('https://other.example')
    expect(club.address).toMatchObject({ locality: 'Elsewhere', region: 'VIC' })
    expect(club.socials).toEqual([{ platform: 'instagram', url: 'https://instagram.com/other', label: 'Instagram' }])
    expect(club.sameAs).toEqual(['https://instagram.com/other'])
    expect(club.logoUrl).toBe('https://store.public.blob.vercel-storage.com/logo.png')
    expect(club.ogImage.url).toBe('/og-image.jpg')
  })

  it('mergeOver ignores keys the defaults do not have and type mismatches', () => {
    expect(mergeOver({ a: 'x', n: 1 }, { a: 5, n: 2, extra: true })).toEqual({ a: 'x', n: 2 })
  })
})
