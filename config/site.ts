/**
 * Template-level constants (spec §1, §4.1 "What stays out of the global"). Build-time values
 * that cannot come from the database: the client-set cookie names, the club's timezone and
 * the agency credit. Club identity and copy live in `payload/seed/club-defaults.ts`.
 */

const env = process.env
/** Production has NO Lang Lang fallback for the three club-identity values (see `assertClubEnv`). */
const isProduction = env.VERCEL_ENV === 'production'
const LL = { host: 'langlangcricketclub.com', orgId: '484ced51-403a-466c-9a94-bd95eedf7319', teamPrefix: 'Lang Lang' } as const

/**
 * Cookie names are `${COOKIE_PREFIX}_…` (llcc_rsvps, llcc_story_draft, llcc_ann_dismissed). Env
 * `COOKIE_PREFIX`; Lang Lang keeps `llcc` so saved visitor state is not reset.
 */
export const COOKIE_PREFIX = env.COOKIE_PREFIX || 'llcc'

/** Wall-clock timezone for event dates, JSON-LD offsets, announcement and PlayHQ dates. Env `CLUB_TIMEZONE`. */
export const CLUB_TIMEZONE = env.CLUB_TIMEZONE || 'Australia/Melbourne'

/** BCP 47 locale for displayed dates (keep in step with `club.locale`). Env `CLUB_LOCALE`. */
export const CLUB_LOCALE = env.CLUB_LOCALE || 'en-AU'

/**
 * The canonical host (next.config redirects, seed-club's siteUrl check). Env `CANONICAL_HOST`.
 * The Lang Lang value is a non-production default only.
 */
export const CANONICAL_HOST = env.CANONICAL_HOST || (isProduction ? '' : LL.host)

/** Prefix of downloaded file names (`<prefix>-statlab-season.csv`). Env `EXPORT_FILENAME_PREFIX`; empty means "derive from the club's short name". */
export const EXPORT_FILENAME_PREFIX = env.EXPORT_FILENAME_PREFIX || ''

/**
 * PlayHQ identity; env `PLAYHQ_ORG_ID` / `PLAYHQ_CLUB_URL` / `PLAYHQ_TEAM_PREFIX` win. `teamNamePrefix`
 * is stripped from PlayHQ team names for display ("Lang Lang B Grade" to "B Grade"). Lang Lang values are
 * non-production defaults only: in production an unset org or prefix stays empty and `assertClubEnv()`
 * throws at server start, so a new club can never silently serve Lang Lang's live PlayHQ data.
 */
export const PLAYHQ_DEFAULTS = {
  orgId: env.PLAYHQ_ORG_ID || (isProduction ? '' : LL.orgId),
  clubUrl:
    env.PLAYHQ_CLUB_URL ||
    (isProduction ? 'https://www.playhq.com' : 'https://www.playhq.com/cricket-australia/org/lang-lang-cricket-club/484ced51'),
  teamNamePrefix: env.PLAYHQ_TEAM_PREFIX || (isProduction ? '' : LL.teamPrefix),
} as const

/**
 * Static club files that must be known before the database exists (admin favicon, build-time file
 * tracing, the last step of the crest chain). A new club replaces the file; the crest itself is chosen
 * in Admin > Site look.
 */
export const BRANDING = { logo: '/assets/branding/logo.png' } as const

/** Throws, in production only, when a value with no production fallback is unset. Called from instrumentation.ts (not at build). */
export function assertClubEnv(e: Record<string, string | undefined> = process.env): void {
  if (e.VERCEL_ENV !== 'production') return
  const required = ['PLAYHQ_ORG_ID', 'PLAYHQ_TEAM_PREFIX', 'CANONICAL_HOST']
  const missing = required.filter((k) => !e[k]?.trim())
  if (missing.length) {
    throw new Error(
      `Club settings are missing: ${missing.join(', ')}. Set them in the Vercel production environment (see .env.example). ` +
        'They have no default in production so that one club never shows another club\'s data.',
    )
  }
}

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
