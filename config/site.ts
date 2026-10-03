/**
 * Template-level constants (spec §1, §4.1 "What stays out of the global"). Build-time values
 * that cannot come from the database: the client-set cookie names, the club's timezone and
 * the agency credit. Club identity and copy live in `payload/seed/club-defaults.ts`.
 */

/** Cookie names are `${COOKIE_PREFIX}_…` (llcc_rsvps, llcc_story_draft, llcc_ann_dismissed). */
export const COOKIE_PREFIX = 'llcc'

/** Wall-clock timezone for event dates, JSON-LD offsets, announcement and PlayHQ dates. */
export const CLUB_TIMEZONE = 'Australia/Melbourne'

/** BCP 47 locale for displayed dates (keep in step with `club.locale`). */
export const CLUB_LOCALE = 'en-AU'

/** Fallback for CANONICAL_HOST (next.config redirects, seed-club's siteUrl check). */
export const DEFAULT_CANONICAL_HOST = 'langlangcricketclub.com'

/**
 * PlayHQ defaults; env `PLAYHQ_ORG_ID` / `PLAYHQ_CLUB_URL` override them. `teamNamePrefix`
 * is stripped from PlayHQ team names for display ("Lang Lang B Grade" → "B Grade").
 */
export const PLAYHQ_DEFAULTS = {
  orgId: '484ced51-403a-466c-9a94-bd95eedf7319',
  clubUrl: 'https://www.playhq.com/cricket-australia/org/lang-lang-cricket-club/484ced51',
  teamNamePrefix: 'Lang Lang',
} as const

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
