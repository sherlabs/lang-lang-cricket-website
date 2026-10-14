import 'server-only'
import { cache } from 'react'
import { getClub, type Club } from '@/lib/club'
import { getPayloadClient } from '@/lib/payload/client'
import { requestTimings } from '@/lib/admin/timing'
import { adminThemeCache } from '@/lib/theme/admin-cache'
import { themeReadFailureIsFatal } from '@/lib/theme/read-failure'
import { resolveTheme, type ResolvedTheme } from '@/lib/theme/resolve'
import { THEME_NEUTRAL } from '@/payload/seed/theme-defaults'

export type { ResolvedTheme } from '@/lib/theme/resolve'

let warned = false

/**
 * The club's colours, display font and crest: the `theme` global resolved over the seed
 * (`payload/seed/theme-defaults.ts`). Cached per request. Falls back to the seed when the database is
 * unreachable or the table does not exist yet, so pages render in development, tests and previews. On Vercel
 * production a failed read throws instead (`themeReadFailureIsFatal`), so ISR keeps the last good page rather
 * than caching one in the wrong club's colours. A missing row is not a failure: it resolves to the seed. The crest chain is
 * theme.crest, then the legacy Club details logo, then the bundled crest (resolved in `resolveTheme`).
 */
async function readTheme(): Promise<ResolvedTheme> {
  const [payload, club] = await Promise.all([getPayloadClient(), getClub()])
  const doc = await payload.findGlobal({ slug: 'theme', depth: 1 })
  return resolveTheme(doc, { clubLogoUrl: club.logoUrl })
}

export const getTheme = cache(async (): Promise<ResolvedTheme> => {
  try {
    return await readTheme()
  } catch (err) {
    if (themeReadFailureIsFatal()) throw err
    if (!warned) {
      warned = true
      console.warn('[theme] could not read the theme global, using the seed:', (err as Error).message)
    }
    return resolveTheme(null)
  }
})

/**
 * `getClub()` with `logoUrl` set to the crest from the theme (theme.crest, then the legacy club logo, then
 * the bundled crest). Use it where a page wants "the crest" (home hero, footer, JSON-LD); `getClub().logoUrl`
 * itself stays the legacy Club details logo.
 */
export const getClubWithCrest = cache(async (): Promise<Club> => {
  const [club, theme] = await Promise.all([getClub(), getTheme()])
  return { ...club, logoUrl: theme.crest.url }
})

/**
 * The theme for the admin layout, which must never hold up the first byte (wave G WP-0). Served from a per-instance
 * stale-while-revalidate cache (`lib/theme/admin-cache.ts`): a stale value (older than 60 seconds) is served while one refresh
 * runs, the `theme` and `club` globals' afterChange hooks clear it on the instance that saved, and other instances lag by up to a
 * minute. A cold cache waits at most half a second for the read; if it is slower or fails, this render uses a neutral slate theme
 * (never the seed club's colours) and the real one appears on the next. It never throws, unlike `getTheme()`, whose fatal rule for the public site is untouched.
 */
export const getAdminTheme = cache(async (): Promise<ResolvedTheme> => {
  const started = performance.now()
  const { value } = await adminThemeCache<ResolvedTheme>().get(readTheme, () => resolveTheme(THEME_NEUTRAL))
  requestTimings().themeMs = Math.round(performance.now() - started) // for the per-render log line (lib/admin/timing.ts)
  return value
})
