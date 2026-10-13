import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { clubDefaults } from '@/payload/seed/club-defaults'
import { DEFAULT_SPONSOR_CAROUSEL_TIERS, DEFAULT_STATS_SETTINGS, normaliseTiers, resolveStatsSettings, withClubHonourKeywords, withRenamedGradeRules, type StatsSettings } from './site-settings-core'

export { DEFAULT_SPONSOR_CAROUSEL_TIERS, DEFAULT_STATS_SETTINGS, normaliseTiers, resolveStatsSettings, selectCarouselSponsors } from './site-settings-core'
export type { StatsSettings } from './site-settings-core'

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

/**
 * Stats configuration (categories, grade rules, qualification, milestones, honour categories).
 * Defaults until the global has been saved; any read failure also falls back to the defaults.
 */
export async function getStatsSettings(): Promise<StatsSettings> {
  try {
    const payload = await getPayloadClient()
    const [settings, club] = await Promise.all([
      payload.findGlobal({ slug: 'site-settings', depth: 0 }),
      payload.findGlobal({ slug: 'club', depth: 0 }).catch(() => null),
    ])
    // The saved keywords plus the active preset's: a club row saved before the keywords existed still classifies association honours.
    const saved = (club as unknown as { honourKeywords?: unknown } | null)?.honourKeywords
    const keywords = [...clubDefaults.honourKeywords, ...(Array.isArray(saved) ? saved : [])]
    if (!settings?.updatedAt) return withClubHonourKeywords(DEFAULT_STATS_SETTINGS, keywords)
    return withClubHonourKeywords(withRenamedGradeRules(resolveStatsSettings((settings as unknown as { stats?: unknown }).stats)), keywords)
  } catch (err) {
    console.warn('[site-settings] could not read stats settings, using defaults:', (err as Error).message)
    return DEFAULT_STATS_SETTINGS
  }
}
