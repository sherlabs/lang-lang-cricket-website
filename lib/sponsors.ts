/** Sponsor tiers, in display rank. Shared by the `sponsors` collection, the `site-settings` global and the public pages. */
export const TIER_ORDER = ['Platinum', 'Gold', 'Silver', 'Bronze', 'Player'] as const
export type SponsorTier = (typeof TIER_ORDER)[number]
export const TIERS: readonly string[] = TIER_ORDER
export const DEFAULT_TIER: SponsorTier = 'Bronze'
