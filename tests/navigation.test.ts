import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NavPage } from '../lib/domain'
import { buildNavigation, MAX_PRIMARY_PAGES, NEWS_HREF } from '../lib/navigation'
import { clubDefaults } from '../payload/seed/club-defaults'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

const base = clubDefaults.navigation
const NEWS_LINK = { href: NEWS_HREF, label: base.newsLabel }
const page = (slug: string, over: Partial<NavPage> = {}): NavPage => ({ slug, title: slug.toUpperCase(), navLabel: '', showInNavigation: 'clubhouse', navOrder: 100, ...over })

describe('buildNavigation', () => {
  it('with no pages and no news gives exactly the default navigation', () => {
    const nav = buildNavigation({ base, pages: [], hasNews: false })
    expect(nav).toEqual({
      primary: base.primaryNav,
      clubhouseLabel: base.clubhouseLabel,
      clubhouse: base.clubhouseNav,
      cta: base.navCta,
      footerHeading: base.footerNav.heading,
      footerColumns: base.footerNav.columns,
    })
  })

  it('does not mutate the defaults', () => {
    const before = JSON.stringify(base)
    buildNavigation({ base, pages: [page('a', { showInNavigation: 'footer' })], hasNews: true })
    expect(JSON.stringify(base)).toBe(before)
  })

  it('appends clubhouse pages in navOrder, then title, using navLabel over the title', () => {
    const nav = buildNavigation({
      base,
      pages: [page('late', { navOrder: 50 }), page('early', { navOrder: 5, navLabel: 'Early bird' }), page('b-tie'), page('a-tie')],
      hasNews: false,
    })
    expect(nav.clubhouse.slice(base.clubhouseNav.length)).toEqual([
      { href: '/info/early', label: 'Early bird' },
      { href: '/info/late', label: 'LATE' },
      { href: '/info/a-tie', label: 'A-TIE' },
      { href: '/info/b-tie', label: 'B-TIE' },
    ])
  })

  it('caps primary pages at two; the extras fall into Clubhouse in a deterministic order', () => {
    expect(MAX_PRIMARY_PAGES).toBe(2)
    const pages = [3, 1, 4, 2].map((n) => page(`p${n}`, { showInNavigation: 'primary', navOrder: n }))
    const nav = buildNavigation({ base, pages: [...pages, page('club', { navOrder: 3.5 })], hasNews: false })
    expect(nav.primary.slice(base.primaryNav.length).map((l) => l.href)).toEqual(['/info/p1', '/info/p2'])
    expect(nav.clubhouse.slice(base.clubhouseNav.length).map((l) => l.href)).toEqual(['/info/p3', '/info/club', '/info/p4'])
    const shuffled = buildNavigation({ base, pages: [...pages, page('club', { navOrder: 3.5 })].reverse(), hasNews: false })
    expect(shuffled).toEqual(nav)
  })

  it('footer pages go to the second footer column; none appear in the other lists', () => {
    const nav = buildNavigation({ base, pages: [page('ground', { showInNavigation: 'footer' })], hasNews: false })
    expect(nav.footerColumns[0]).toEqual(base.footerNav.columns[0])
    expect(nav.footerColumns[1].at(-1)).toEqual({ href: '/info/ground', label: 'GROUND' })
    expect(nav.clubhouse).toEqual(base.clubhouseNav)
    expect(nav.primary).toEqual(base.primaryNav)
  })

  it('"none" and slug-less pages never appear', () => {
    const nav = buildNavigation({ base, pages: [page('hidden', { showInNavigation: 'none' }), page('')], hasNews: false })
    expect(nav.clubhouse).toEqual(base.clubhouseNav)
  })

  it('adds the News link to Clubhouse and the footer only when there is a post', () => {
    const without = buildNavigation({ base, pages: [], hasNews: false })
    expect(JSON.stringify(without)).not.toContain('/news')
    const withNews = buildNavigation({ base, pages: [], hasNews: true })
    expect(withNews.clubhouse.at(-1)).toEqual(NEWS_LINK)
    expect(withNews.footerColumns[1].at(-1)).toEqual(NEWS_LINK)
    expect(withNews.primary).toEqual(base.primaryNav)
  })
})

// ---- getNavigation: caching wrapper and DB-down fallback ----
let fake: PayloadFake | null
vi.mock('@/lib/payload/client', () => ({
  getPayloadClient: async () => {
    if (!fake) throw new Error('database is down')
    return fake
  },
}))
// The real unstable_cache needs Next's incremental cache; a pass-through keeps these unit tests honest about the queries.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} }))

describe('getNavigation', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fake = createPayloadFake({
      pages: [
        { id: 1, slug: 'about', title: 'About', status: 'published', showInNavigation: 'clubhouse', navLabel: '', navOrder: 10 },
        { id: 2, slug: 'draft-one', title: 'Draft', status: 'draft', showInNavigation: 'clubhouse', navLabel: '', navOrder: 1 },
        { id: 3, slug: 'unlisted', title: 'Unlisted', status: 'published', showInNavigation: 'none', navLabel: '', navOrder: 1 },
      ],
      news: [],
    })
  })

  it('merges published, placed pages over the defaults and states its own filters', async () => {
    const { getNavigation } = await import('../lib/navigation-queries')
    const nav = await getNavigation()
    expect(nav.clubhouse.map((l) => l.href)).toContain('/info/about')
    expect(nav.clubhouse.map((l) => l.href)).not.toContain('/info/draft-one')
    expect(nav.clubhouse.map((l) => l.href)).not.toContain('/info/unlisted')
    expect(nav.clubhouse.map((l) => l.href)).not.toContain('/news')
    const where = JSON.stringify(fake!.callsTo('find', 'pages')[0].args.where)
    expect(where).toContain('"published"')
    expect(where).toContain('not_equals')
  })

  it('adds News once a visible post exists, not for a scheduled one', async () => {
    fake!.store.news = [{ id: 1, slug: 'future', status: 'published', publishedAt: new Date(Date.now() + 864e5).toISOString() }]
    const { getNavigation } = await import('../lib/navigation-queries')
    expect((await getNavigation()).clubhouse.map((l) => l.href)).not.toContain('/news')
    vi.resetModules()
    fake!.store.news = [{ id: 2, slug: 'now', status: 'published', publishedAt: new Date(Date.now() - 864e5).toISOString() }]
    const again = await import('../lib/navigation-queries')
    expect((await again.getNavigation()).clubhouse.map((l) => l.href)).toContain('/news')
  })

  it('falls back to exactly the defaults when the database is down', async () => {
    fake = null
    const { getNavigation } = await import('../lib/navigation-queries')
    const nav = await getNavigation()
    expect(nav).toEqual(buildNavigation({ base, pages: [], hasNews: false }))
    expect(nav.clubhouse).toEqual(base.clubhouseNav)
  })
})
