import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { TIER_ORDER } from '@/components/sponsor-logos'

export const SPONSOR_CAROUSEL_TIERS_KEY = 'sponsorCarouselTiers'
export const DEFAULT_SPONSOR_CAROUSEL_TIERS: readonly string[] = ['Platinum', 'Gold']

/**
 * Coerce a stored value into a list of valid sponsor tiers, in TIER_ORDER
 * order with duplicates and unknown tiers dropped. Returns `null` when the
 * value isn't a list at all (caller should fall back to the default);
 * an empty list is a legitimate "show nothing" choice and is returned as `[]`.
 */
export function normaliseTiers(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const wanted = new Set(value.filter((v): v is string => typeof v === 'string'))
  return TIER_ORDER.filter((tier) => wanted.has(tier))
}

let warnedMissingSetting = false

/** Tiers whose logos scroll across the home page; defaults to Platinum + Gold until an admin saves a choice. */
export async function getSponsorCarouselTiers(): Promise<string[]> {
  try {
    const [row] = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, SPONSOR_CAROUSEL_TIERS_KEY))
    return normaliseTiers(row?.value) ?? [...DEFAULT_SPONSOR_CAROUSEL_TIERS]
  } catch (err) {
    // Most likely the site_settings table hasn't been pushed yet; the home
    // page should still render, so fall back to the default and say so once.
    if (!warnedMissingSetting) {
      warnedMissingSetting = true
      console.warn('[site-settings] could not read sponsorCarouselTiers, using default:', (err as Error).message)
    }
    return [...DEFAULT_SPONSOR_CAROUSEL_TIERS]
  }
}
