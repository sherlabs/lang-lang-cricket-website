import 'server-only'
import { cache } from 'react'
import { getClub, type Club } from '@/lib/club'
import { getPayloadClient } from '@/lib/payload/client'
import { resolveTheme, type ResolvedTheme } from '@/lib/theme/resolve'

export type { ResolvedTheme } from '@/lib/theme/resolve'

let warned = false

/**
 * The club's colours, display font and crest: the `theme` global resolved over the seed
 * (`payload/seed/theme-defaults.ts`). Cached per request. Falls back to the seed when the database is
 * unreachable or the table does not exist yet, so pages always render. The crest chain is
 * theme.crest, then the legacy Club details logo, then the bundled crest (resolved in `resolveTheme`).
 */
export const getTheme = cache(async (): Promise<ResolvedTheme> => {
  try {
    const [payload, club] = await Promise.all([getPayloadClient(), getClub()])
    const doc = await payload.findGlobal({ slug: 'theme', depth: 1 })
    return resolveTheme(doc, { clubLogoUrl: club.logoUrl })
  } catch (err) {
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
