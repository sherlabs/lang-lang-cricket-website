/**
 * Template-level constants (spec §1, §4.1 "What stays out of the global"). Build-time values
 * that cannot come from the database: the client-set cookie names, the club's timezone and
 * the agency credit. Club identity and copy live in `payload/seed/club-defaults.ts`.
 */

/** Cookie names are `${COOKIE_PREFIX}_…` (llcc_rsvps, llcc_story_draft, llcc_ann_dismissed). */
export const COOKIE_PREFIX = 'llcc'

/** Wall-clock timezone for event dates, JSON-LD offsets and announcement dates. */
export const CLUB_TIMEZONE = 'Australia/Melbourne'

/** Footer credit; `utm_source` is the club site's host so visits are attributable. */
export const AGENCY_CREDIT = {
  url: 'https://www.sherlabs.com/',
  name: 'sherlabs.com',
  tagline: 'Websites for clubs & local businesses',
} as const

export function agencyCreditHref(siteUrl: string): string {
  let host = siteUrl
  try {
    host = new URL(siteUrl).host
  } catch {
    // keep the raw value
  }
  return `${AGENCY_CREDIT.url}?utm_source=${host}&utm_medium=referral&utm_campaign=footer_credit`
}
