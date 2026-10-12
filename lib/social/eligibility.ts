/**
 * Public on the website is not consent to be pushed to social networks (wave C spec section 1). A junior may be named, shown with
 * stats or pictured on a graphic only when staff ticked `socialOptIn` on the player. Pure, and it fails closed: a player we know
 * nothing about is not eligible, and an unreadable date of birth does not count as an adult.
 */
export type SocialPlayer = {
  /** Staff-only flag for clubs that do not store dates of birth. */
  isJunior?: boolean | null
  /** Staff-only: a parent or guardian agreed to posting this child's name and stats. */
  socialOptIn?: boolean | null
  /** ISO date `YYYY-MM-DD`, when the club records one. */
  dateOfBirth?: string | null
  /** The player's latest season was in a junior grade category. */
  juniorCategory?: boolean | null
}

/** Whole years between `dob` and `onDate` (both `YYYY-MM-DD`), or null when either is not a date. */
export function ageOn(dob: string, onDate: string): number | null {
  const re = /^(\d{4})-(\d{2})-(\d{2})/
  const a = re.exec(dob), b = re.exec(onDate)
  if (!a || !b) return null
  const [ay, am, ad, by, bm, bd] = [a[1], a[2], a[3], b[1], b[2], b[3]].map(Number)
  if ([am, ad, bm, bd].some((n) => n < 1)) return null
  return by - ay - (bm < am || (bm === am && bd < ad) ? 1 : 0)
}

/** True when any signal says junior; an unreadable date of birth is treated as a junior (fail closed). */
export function isJunior(p: SocialPlayer, onDate: string): boolean {
  if (p.isJunior === true || p.juniorCategory === true) return true
  if (p.dateOfBirth) {
    const age = ageOn(p.dateOfBirth, onDate)
    return age === null || age < 18
  }
  return false
}

/** May this player appear on a social graphic? Adults always; juniors only with the opt-in; unknown players never. */
export function isSocialEligible(p: SocialPlayer | null | undefined, onDate: string): boolean {
  if (!p) return false
  return !isJunior(p, onDate) || p.socialOptIn === true
}

/**
 * Players whose latest season was in a junior grade category. `seasonOrder` counts up into the past (0 is the newest), as in the
 * stats rows. Pure: the caller supplies the classifier (`categoryOf` with the club's grade rules).
 */
export function juniorCategoryIds<R extends { playerId: number; seasonOrder: number }>(rows: readonly R[], isJuniorRow: (r: R) => boolean): Set<number> {
  const latest = new Map<number, number>()
  for (const r of rows) latest.set(r.playerId, Math.min(latest.get(r.playerId) ?? Infinity, r.seasonOrder))
  const out = new Set<number>()
  for (const r of rows) if (r.seasonOrder === latest.get(r.playerId) && isJuniorRow(r)) out.add(r.playerId)
  return out
}
