import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

let fake: PayloadFake
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))

const media = (url: string) => ({ id: 99, url })

beforeEach(() => {
  fake = createPayloadFake({
    sponsors: [
      { id: 3, name: 'Harbour', tier: 'Gold', sortOrder: 1, linkUrl: '', logo: media('https://x/h.png') },
      { id: 2, name: 'Vibe', tier: 'Gold', sortOrder: 0, linkUrl: '', logo: null },
      { id: 1, name: 'Bank', tier: 'Platinum', sortOrder: 0, linkUrl: 'https://bank', logo: 5 },
    ],
    'gallery-photos': [
      { id: 1, url: '/a.jpg', caption: '', sortOrder: 0, createdAt: '2025-07-01T00:00:00.000Z' },
      { id: 3, url: '/c.jpg', caption: 'C', sortOrder: -2, createdAt: '2026-01-10T00:00:00.000Z' },
      { id: 7, url: '/g.jpg', caption: '', sortOrder: 2, createdAt: '2026-03-02T00:00:00.000Z' },
    ],
    documents: [
      { id: 2, title: 'B doc', category: 'Policies', url: '/b.pdf' },
      { id: 1, title: 'A doc', category: 'Game Day', url: '/a.pdf' },
    ],
    people: [
      { id: 2, name: 'Jamie', role: 'Secretary', section: 'committee', phone: '', email: '', sortOrder: 1, photo: null },
      { id: 1, name: 'Alex', role: 'President', section: 'committee', phone: '1', email: 'a@x', sortOrder: 0, photo: media('/p.jpg') },
      { id: 4, name: 'Chris', role: 'Captain', section: 'leadership', phone: '', email: '', sortOrder: 0, photo: null },
    ],
    announcements: [
      { id: 1, title: 'Old', body: 'x', published: true, createdAt: '2026-09-01T02:00:00.000Z', updatedAt: '2026-09-01T02:00:00.000Z' },
      { id: 2, title: 'New', body: 'y', published: true, createdAt: '2026-09-20T02:00:00.000Z', updatedAt: '2026-09-20T02:00:00.000Z' },
      { id: 4, title: 'Draft', body: '', published: false, createdAt: '2026-09-25T02:00:00.000Z', updatedAt: '2026-09-25T02:00:00.000Z' },
    ],
  })
})

describe('content-queries (spec §14)', () => {
  it('listSponsors orders by sortOrder then id and resolves logo URLs ("" when unpopulated or empty)', async () => {
    const { listSponsors } = await import('@/lib/content-queries')
    const rows = await listSponsors()
    expect(rows.map((s) => s.id)).toEqual([1, 2, 3])
    expect(rows.map((s) => s.logoUrl)).toEqual(['', '', 'https://x/h.png'])
    expect(fake.callsTo('find', 'sponsors')[0].args).toMatchObject({ sort: ['sortOrder', 'id'], pagination: false, depth: 1 })
  })

  it('listGalleryPhotos sorts by sortOrder and honours a limit; the OG photo is the newest by createdAt', async () => {
    const { getGalleryOgPhoto, listGalleryPhotos } = await import('@/lib/content-queries')
    expect((await listGalleryPhotos()).map((p) => p.id)).toEqual([3, 1, 7])
    expect((await listGalleryPhotos(2)).map((p) => p.id)).toEqual([3, 1])
    expect((await getGalleryOgPhoto())?.id).toBe(7)
    expect(fake.callsTo('find', 'gallery-photos').at(-1)!.args).toMatchObject({ sort: ['-createdAt', '-id'], limit: 1 })
  })

  it('listDocuments sorts by title', async () => {
    const { listDocuments } = await import('@/lib/content-queries')
    expect((await listDocuments()).map((d) => d.title)).toEqual(['A doc', 'B doc'])
  })

  it('listPeople orders by sortOrder and filters by section when asked', async () => {
    const { listPeople } = await import('@/lib/content-queries')
    expect((await listPeople()).map((p) => p.name)).toEqual(['Alex', 'Chris', 'Jamie'])
    const committee = await listPeople('committee')
    expect(committee.map((p) => p.name)).toEqual(['Alex', 'Jamie'])
    expect(committee[0].photoUrl).toBe('/p.jpg')
    expect(fake.callsTo('find', 'people').at(-1)!.args.where).toEqual({ section: { equals: 'committee' } })
  })
})

describe('announcements-queries: every public query states its own filter (spec §2)', () => {
  it('getLatestAnnouncement → newest published', async () => {
    const { getLatestAnnouncement } = await import('@/lib/announcements-queries')
    const latest = await getLatestAnnouncement()
    expect(latest?.title).toBe('New')
    expect(latest?.createdAt).toBeInstanceOf(Date)
    expect(fake.callsTo('find', 'announcements')[0].args).toMatchObject({ where: { published: { equals: true } }, limit: 1 })
  })

  it('listPublishedAnnouncements → published only, newest first', async () => {
    const { listPublishedAnnouncements } = await import('@/lib/announcements-queries')
    expect((await listPublishedAnnouncements()).map((a) => a.title)).toEqual(['New', 'Old'])
    expect(fake.callsTo('find', 'announcements')[0].args.where).toEqual({ published: { equals: true } })
  })

  it('returns null / [] when nothing is published', async () => {
    fake.store.announcements = []
    const { getLatestAnnouncement, listPublishedAnnouncements } = await import('@/lib/announcements-queries')
    expect(await getLatestAnnouncement()).toBeNull()
    expect(await listPublishedAnnouncements()).toEqual([])
  })
})

describe('getSponsorCarouselTiers', () => {
  it('defaults to Platinum + Gold while the global has never been saved', async () => {
    const { getSponsorCarouselTiers } = await import('@/lib/site-settings')
    expect(await getSponsorCarouselTiers()).toEqual(['Platinum', 'Gold'])
  })

  it('normalises a saved value, and a saved [] hides the carousel', async () => {
    const { getSponsorCarouselTiers } = await import('@/lib/site-settings')
    await fake.updateGlobal({ slug: 'site-settings', data: { sponsorCarouselTiers: ['Silver', 'Platinum', 'Silver'] } })
    expect(await getSponsorCarouselTiers()).toEqual(['Platinum', 'Silver'])
    await fake.updateGlobal({ slug: 'site-settings', data: { sponsorCarouselTiers: [] } })
    expect(await getSponsorCarouselTiers()).toEqual([])
  })
})
