/**
 * Who may be priced, listed in the picker, scored and ranked (wave F spec 4.3). ONE function every consumer uses. Minors are never
 * priced, rated, ranked, listed or scored: `isJunior` (the "under 18" flag on a player) is tested explicitly, not inferred from a
 * grade or a stats filter. Hidden players are out too.
 */
export type EligibilityInput = {
  hidden: boolean
  isJunior: boolean
  /** In a current squad. */
  inCurrentSquad: boolean
  /** Appearances in the stored seasons used for pricing. */
  recentAppearances: number
  /** The committee has not removed the player from the pool. */
  available: boolean
}

export function isEligible(p: EligibilityInput): boolean {
  if (p.hidden || p.isJunior) return false
  if (!p.available) return false
  return p.inCurrentSquad || p.recentAppearances > 0
}

/** The same test without the committee's availability flag (used to decide who gets a price row at all). */
export const canBePriced = (p: Omit<EligibilityInput, 'available'>): boolean => isEligible({ ...p, available: true })

/** A player who is no longer in the game: hidden, flagged junior or removed from the pool after being picked. */
export const isInTheGame = (p: { hidden: boolean; isJunior: boolean; available: boolean } | null | undefined): boolean => Boolean(p && !p.hidden && !p.isJunior && p.available)
