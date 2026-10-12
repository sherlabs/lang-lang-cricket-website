/**
 * Template-level constants (spec §1, §4.1 "What stays out of the global"). Build-time values
 * that cannot come from the database: the client-set cookie names, the club's timezone and
 * the agency credit. Club identity and copy live in `payload/seed/club-defaults.ts`.
 */

const env = process.env
/**
 * Lang Lang fallbacks for the three club-identity values apply ONLY to local development and tests
 * (NODE_ENV development or test). Anything else (a production build, a Vercel preview, a self-hosted
 * `next start`) must set them, so another club's deployment can never call Lang Lang's live PlayHQ.
 */
export const allowSeedFallbacks = (e: Record<string, string | undefined> = process.env): boolean =>
  e.NODE_ENV === 'development' || e.NODE_ENV === 'test'
const isProduction = !allowSeedFallbacks(env)
const LL = { host: 'langlangcricketclub.com', orgId: '484ced51-403a-466c-9a94-bd95eedf7319', teamPrefix: 'Lang Lang' } as const

/**
 * Cookie names are `${COOKIE_PREFIX}_…` (llcc_rsvps, llcc_story_draft, llcc_ann_dismissed). Env
 * `COOKIE_PREFIX`; Lang Lang keeps `llcc` so saved visitor state is not reset.
 */
export const COOKIE_PREFIX = env.COOKIE_PREFIX || 'llcc'

/** Wall-clock timezone for event dates, JSON-LD offsets, announcement and PlayHQ dates. Env `CLUB_TIMEZONE`. */
export const CLUB_TIMEZONE = env.CLUB_TIMEZONE || 'Australia/Melbourne'

/**
 * When the club's season starts (1-12) and how a season is named. Env `SEASON_START_MONTH` (default 7: a southern-hemisphere
 * summer season starting in July) and `SEASON_NAME_FORMAT` (`split` gives "2012/13", `single` gives "2013", the start year, for
 * a northern-hemisphere club whose season sits inside one calendar year with `SEASON_START_MONTH=1`). Used to place imported history.
 */
const startMonth = Number(env.SEASON_START_MONTH)
export const SEASON_START_MONTH = Number.isInteger(startMonth) && startMonth >= 1 && startMonth <= 12 ? startMonth : 7
export const SEASON_NAME_FORMAT: 'split' | 'single' = env.SEASON_NAME_FORMAT === 'single' ? 'single' : 'split'

/** BCP 47 locale for displayed dates (keep in step with `club.locale`). Env `CLUB_LOCALE`. */
export const CLUB_LOCALE = env.CLUB_LOCALE || 'en-AU'

/**
 * Club back office defaults (wave D). The office settings global is the editable copy; these are only what it starts with.
 * Env `OFFICE_CURRENCY` (ISO 4217 code, default AUD) and `OFFICE_LOCALE` (BCP 47, default `CLUB_LOCALE`).
 */
export const OFFICE_CURRENCY = (env.OFFICE_CURRENCY || 'AUD').trim().toUpperCase()
export const OFFICE_LOCALE = env.OFFICE_LOCALE?.trim() || CLUB_LOCALE

/**
 * Two-letter country code of the club (phone parsing, privacy notice wording). Env `CLUB_COUNTRY`; defaults to the region of
 * `CLUB_LOCALE` (en-AU gives AU). An unknown country falls back to a permissive digits-only phone normaliser.
 */
export const CLUB_COUNTRY = (env.CLUB_COUNTRY?.trim() || CLUB_LOCALE.split('-')[1] || '').toUpperCase()

/**
 * The canonical host (next.config redirects, seed-club's siteUrl check). Env `CANONICAL_HOST`.
 * The Lang Lang value is a development and test default only.
 */
export const CANONICAL_HOST = env.CANONICAL_HOST || (isProduction ? '' : LL.host)

/** Prefix of downloaded file names (`<prefix>-statlab-season.csv`). Env `EXPORT_FILENAME_PREFIX`; empty means "derive from the club's short name". */
export const EXPORT_FILENAME_PREFIX = env.EXPORT_FILENAME_PREFIX || ''

/**
 * Social posting queue tuning (wave C spec 1, "Constants, not env knobs"). Generic numbers, the same for every club.
 * A post is tried up to `SOCIAL_MAX_ATTEMPTS` times, waiting `SOCIAL_BACKOFF_MINUTES[attempt - 1]` between tries; a run that
 * has not finished after `SOCIAL_LEASE_MINUTES` is treated as dead; one run claims at most `SOCIAL_CLAIM_BATCH` posts; the
 * signed picture link keeps working `SOCIAL_IMAGE_GRACE_MINUTES` after a post finishes (so a network can still fetch it).
 */
export const SOCIAL_MAX_ATTEMPTS = 3
export const SOCIAL_BACKOFF_MINUTES: readonly number[] = [5, 15, 45]
export const SOCIAL_LEASE_MINUTES = 10
export const SOCIAL_CLAIM_BATCH = 5
export const SOCIAL_IMAGE_GRACE_MINUTES = 15
/** One call to a network is cut off after this long; the outcome is then unknown (never retried automatically). */
export const SOCIAL_ADAPTER_TIMEOUT_MS = 20_000
/** The cron stops starting new posts after this long (its route allows 300 s). */
export const SOCIAL_RUN_BUDGET_MS = 240_000
/** A signed picture link is valid for at most this long. */
export const SOCIAL_IMAGE_URL_HOURS = 24

/**
 * PlayHQ identity; env `PLAYHQ_ORG_ID` / `PLAYHQ_CLUB_URL` / `PLAYHQ_TEAM_PREFIX` win. `teamNamePrefix`
 * is stripped from PlayHQ team names for display ("Lang Lang B Grade" to "B Grade"). Lang Lang values are
 * development and test defaults only: anywhere else an unset org or prefix stays empty and `assertClubEnv()`
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

/**
 * Throws, outside development and test (Vercel production and preview, or any self-hosted `next start`),
 * when a value with no fallback there is unset. Called from instrumentation.ts (not at build).
 */
export function assertClubEnv(e: Record<string, string | undefined> = process.env): void {
  if (allowSeedFallbacks(e)) return
  const required = ['PLAYHQ_ORG_ID', 'PLAYHQ_TEAM_PREFIX', 'CANONICAL_HOST', 'COOKIE_PREFIX']
  const missing = required.filter((k) => !e[k]?.trim())
  if (missing.length) {
    throw new Error(
      `Club settings are missing: ${missing.join(', ')}. Set them in the deployment environment (see .env.example). ` +
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

/**
 * AI-assisted yearbook summary (W2 spec 6.5). The model id is a plain Vercel AI Gateway `provider/model` string and the only
 * place one appears in code; env `YEARBOOK_AI_MODEL` wins. `dailyDraftLimit` is the site-wide cap on drafts per day (env
 * `AI_DAILY_DRAFT_LIMIT`). Drafting is off until `AI_GATEWAY_API_KEY` (or a Vercel OIDC token) is set.
 */
export const AI_DEFAULTS = {
  yearbookModel: 'anthropic/claude-sonnet-4.6',
  dailyDraftLimit: 20,
} as const

/**
 * Selector accounts and Facebook sign-in (announce-teams spec 3.4, 3.5). The Meta app itself is per club and lives in env
 * (`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`); only these constants are in code.
 */
export const FACEBOOK_GRAPH_VERSION = env.FACEBOOK_GRAPH_VERSION?.trim() || 'v25.0'
/** How long an invite link works (days). Env `SELECTOR_INVITE_DAYS`. */
const inviteDays = Number(env.SELECTOR_INVITE_DAYS)
export const SELECTOR_INVITE_DAYS = Number.isInteger(inviteDays) && inviteDays >= 1 && inviteDays <= 90 ? inviteDays : 14
/** Public paths of the selector area. */
export const selectorPaths = {
  home: '/selector',
  login: '/selector/login',
  account: '/selector/account',
  invite: (token: string) => `/selector/invite/${token}`,
  facebookStart: '/selector/facebook/start',
  facebookCallback: '/selector/facebook/callback',
  facebookDataDeletion: '/selector/facebook/data-deletion',
  facebookDeauthorize: '/selector/facebook/deauthorize',
  facebookDeletionStatus: '/selector/facebook/deletion-status',
  availability: '/selector/availability',
  squads: '/selector/squads',
  link: '/selector/link',
  player: (slug: string) => `/selector/players/${slug}`,
  nets: '/selector/nets',
  net: (id: number | string) => `/selector/nets/${id}`,
  netState: (id: number | string) => `/selector/nets/${id}/state`,
  teams: '/selector/teams',
  team: (gameId: string) => `/selector/teams/${gameId}`,
  teamPreviewImage: (gameId: string) => `/selector/teams/${gameId}/preview-image`,
} as const

/**
 * Availability and squads (announce-teams spec section 4). Fixtures are kept from this many days back to this many days ahead;
 * a PIN is 4 to 6 digits; the public availability link lives under `/availability/<token>`.
 */
export const AVAILABILITY = {
  fixturesBackDays: 14,
  fixturesAheadDays: 120,
  pinMin: 4,
  pinMax: 6,
  noteMax: 140,
  /** A name matching more candidates than this is refused (it would make every attempt cost too many password hashes). */
  maxCandidates: 5,
  rememberDays: 90,
  oneTimeCodeHours: 24,
  /** Unknown names are hashed into this many throttle buckets so random names cannot grow the table without bound. */
  unknownNameBuckets: 64,
} as const
export const availabilityPath = (token: string): string => `/availability/${token}`

/**
 * Best-player votes (wave B spec 3). `label` is the club's word for the award ("Best player", "Player of the match"); env
 * `VOTE_LABEL` overrides it per club. The rest are fixed limits: the ballot, the window and the minimum are settings
 * (`selection-settings`), these are only the guard rails around them.
 */
export const VOTES = {
  label: env.VOTE_LABEL?.trim() || 'Best player',
  /** At most this many values on a ballot (for example 3-2-1 or 5-3-2-1). */
  maxPlaces: 5,
  /** `minBallotsToCount` never goes below this: fewer ballots would let a total point at one voter. */
  minBallotsFloor: 3,
  /** Throttle caps (hits per hour). A clubhouse shares one link and one Wi-Fi address, so link and address are generous. */
  perPlayerPerHour: 20,
  perLinkPerHour: 600,
  perIpPerHour: 120,
  /** Races and the presenter show this many players. */
  chartTop: 5,
} as const
export const votePaths = {
  selector: '/selector/votes',
  settings: '/selector/votes/settings',
  fixture: (id: number | string) => `/selector/votes/${id}`,
  present: '/selector/present/votes',
  publicBoard: '/votes',
  vote: (token: string, fixtureId: number | string) => `/availability/${token}/vote/${fixtureId}`,
} as const
