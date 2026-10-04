/**
 * Pure menu builder (WP-P). The static links stay in `club-defaults.navigation`; published pages carry their
 * own placement, and a News link appears once a post exists. No database, React or Next imports, so it is
 * unit-testable and also usable by the not-found shell when the database is down.
 */
import type { NavPage } from '@/lib/domain'
import type { Link } from '@/payload/seed/club-defaults'

/** At most this many pages may take a place in the main (top bar) menu; the rest fall into Clubhouse. */
export const MAX_PRIMARY_PAGES = 2

/** The link added to the Clubhouse group and the footer once there is a published news post. */
export const NEWS_LINK: Link = { href: '/news', label: 'News' }

export type NavBase = {
  primaryNav: Link[]
  clubhouseLabel: string
  clubhouseNav: Link[]
  navCta: Link
  footerNav: { heading: string; columns: Link[][] }
}

export type Navigation = {
  primary: Link[]
  clubhouseLabel: string
  clubhouse: Link[]
  cta: Link
  footerHeading: string
  footerColumns: Link[][]
}

const label = (p: NavPage) => p.navLabel.trim() || p.title
const link = (p: NavPage): Link => ({ href: `/info/${p.slug}`, label: label(p) })
const byOrder = (a: NavPage, b: NavPage) => a.navOrder - b.navOrder || label(a).localeCompare(label(b)) || a.slug.localeCompare(b.slug)

/** Adds a link unless one with the same address is already there. */
const append = (list: Link[], extra: Link[]): Link[] => [...list, ...extra.filter((l) => !list.some((x) => x.href === l.href))]

export function buildNavigation({ base, pages, hasNews }: { base: NavBase; pages: NavPage[]; hasNews: boolean }): Navigation {
  const usable = pages.filter((p) => p.slug && p.showInNavigation !== 'none').sort(byOrder)
  const primaryPages = usable.filter((p) => p.showInNavigation === 'primary')
  const clubhousePages = [...usable.filter((p) => p.showInNavigation === 'clubhouse'), ...primaryPages.slice(MAX_PRIMARY_PAGES)].sort(byOrder)
  const footerPages = usable.filter((p) => p.showInNavigation === 'footer')

  const newsLink = hasNews ? [NEWS_LINK] : []
  const columns = base.footerNav.columns.map((c) => [...c])
  if (columns.length === 0) columns.push([])
  const b = columns.length > 1 ? 1 : 0
  columns[b] = append(columns[b], [...newsLink, ...footerPages.map(link)])

  return {
    primary: append(base.primaryNav, primaryPages.slice(0, MAX_PRIMARY_PAGES).map(link)),
    clubhouseLabel: base.clubhouseLabel,
    clubhouse: append(base.clubhouseNav, [...newsLink, ...clubhousePages.map(link)]),
    cta: base.navCta,
    footerHeading: base.footerNav.heading,
    footerColumns: columns,
  }
}
