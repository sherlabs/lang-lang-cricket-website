/**
 * Pure sponsor-carousel helpers (spec §14): no database, React or Next imports, so the
 * `site-settings` global config, the query module and unit tests can all use them.
 */
import { TIER_ORDER } from './sponsors'

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

type CarouselSponsor = { tier: string; name: string; logoUrl: string }

/** Keep each business's first occurrence (its highest tier, given tier-ordered input). */
export function dedupeByHighestTier<T extends { name: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((s) => {
    const key = s.name.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Sponsors that belong in the home page carousel: only the selected tiers,
 * only those with a logo, one entry per business (at its highest selected
 * tier), ordered by tier then name.
 */
export function selectCarouselSponsors<T extends CarouselSponsor>(rows: readonly T[], tiers: readonly string[]): T[] {
  const eligible = rows.filter((s) => tiers.includes(s.tier) && s.logoUrl)
  const ordered = TIER_ORDER.flatMap((tier) =>
    eligible.filter((s) => s.tier === tier).sort((a, b) => a.name.localeCompare(b.name)),
  )
  return dedupeByHighestTier(ordered)
}
