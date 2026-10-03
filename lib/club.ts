import 'server-only'
import { cache } from 'react'
import { getPayloadClient } from '@/lib/payload/client'
import { resolveClub, type ResolvedClub } from './club-merge'

export type { ResolvedClub as Club } from './club-merge'

let warned = false

/**
 * The club's identity and copy (spec §4.1): the `club` global merged over
 * `payload/seed/club-defaults.ts`. Cached per request. Falls back to the defaults when the
 * database is unreachable (e.g. static generation without a DB), so pages always render.
 */
export const getClub = cache(async (): Promise<ResolvedClub> => {
  try {
    const payload = await getPayloadClient()
    const [doc, apparel] = await Promise.all([
      payload.findGlobal({ slug: 'club', depth: 1 }),
      // A bonus: an unreadable apparel link must not take the club details down with it.
      payload.findGlobal({ slug: 'club-apparel', depth: 0 }).catch(() => null),
    ])
    return resolveClub(doc as unknown as Record<string, unknown>, undefined, apparel as unknown as Record<string, unknown> | null)
  } catch (err) {
    if (!warned) {
      warned = true
      console.warn('[club] could not read the club global, using defaults:', (err as Error).message)
    }
    return resolveClub(null)
  }
})
