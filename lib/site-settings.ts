import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { DEFAULT_SPONSOR_CAROUSEL_TIERS, normaliseTiers } from './site-settings-core'

export { DEFAULT_SPONSOR_CAROUSEL_TIERS, normaliseTiers, selectCarouselSponsors } from './site-settings-core'

let warnedMissingSetting = false

/**
 * Tiers whose logos scroll across the home page (spec §4.2). Defaults to Platinum + Gold
 * until the `site-settings` global has been saved; a saved `[]` hides the carousel.
 */
export async function getSponsorCarouselTiers(): Promise<string[]> {
  try {
    const payload = await getPayloadClient()
    const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
    // A never-saved global has no timestamps; its empty hasMany must not read as "show nothing".
    if (!settings?.updatedAt) return [...DEFAULT_SPONSOR_CAROUSEL_TIERS]
    return normaliseTiers(settings.sponsorCarouselTiers) ?? [...DEFAULT_SPONSOR_CAROUSEL_TIERS]
  } catch (err) {
    // The home page should still render without the setting; say so once.
    if (!warnedMissingSetting) {
      warnedMissingSetting = true
      console.warn('[site-settings] could not read sponsorCarouselTiers, using default:', (err as Error).message)
    }
    return [...DEFAULT_SPONSOR_CAROUSEL_TIERS]
  }
}
