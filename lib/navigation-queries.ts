import 'server-only'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import type { NavPage } from '@/lib/domain'
import { getClub } from '@/lib/club'
import { buildNavigation, type Navigation } from '@/lib/navigation'
import { hasPublishedNews } from '@/lib/news-queries'
import { listNavPages } from '@/lib/pages-queries'

export type { Navigation } from '@/lib/navigation'

/** The cache tag the page and news hooks expire (`payload/collections/Pages.ts`, `News.ts`). */
export const NAV_CACHE_TAG = 'nav-pages'

/** Pages with a menu placement plus "is there any news", cached so the shell does not hit the database on every render. */
const cachedSources = unstable_cache(
  async (): Promise<{ pages: NavPage[]; hasNews: boolean }> => {
    const [pages, hasNews] = await Promise.all([listNavPages(), hasPublishedNews()])
    return { pages, hasNews }
  },
  ['nav-sources'],
  // The hooks expire the tag on every change; the time bound also lets a scheduled post's News link appear by itself.
  { tags: [NAV_CACHE_TAG], revalidate: 300 },
)

let warned = false

/**
 * The menus: `club-defaults.navigation` plus published pages and (once a post exists) a News link. Cached per
 * request. `FrontendShell` is also the static not-found shell and must render without a database, so any
 * read failure falls back to the plain defaults.
 */
export const getNavigation = cache(async (): Promise<Navigation> => {
  const club = await getClub()
  try {
    const { pages, hasNews } = await cachedSources()
    return buildNavigation({ base: club.navigation, pages, hasNews })
  } catch (err) {
    if (!warned) {
      warned = true
      console.warn('[navigation] could not read pages, using the default menu:', (err as Error).message)
    }
    return buildNavigation({ base: club.navigation, pages: [], hasNews: false })
  }
})
