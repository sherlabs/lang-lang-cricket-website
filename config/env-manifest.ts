/**
 * The one list of environment variables a club deployment uses (wave F spec 5.5): name, whether it is required, where it is
 * read, how it is validated and which group it belongs to. Three consumers read it so they cannot drift: the generated
 * `clubs/<slug>/env-checklist.md`, the table in `docs/template/new-club-checklist.md` (a test compares them) and
 * `pnpm check:template`. Pure: checking takes an env object and reports names and statuses only, never a value.
 */
export type EnvGroup = 'Database and secrets' | 'Club identity' | 'PlayHQ' | 'Region and season' | 'Sign-in' | 'Email' | 'Optional services' | 'Template'

export type EnvEntry = {
  name: string
  group: EnvGroup
  /** Required for a production deployment of a new club. */
  required: boolean
  /** Plain-English description. */
  what: string
  /** Where the code reads it. */
  where: string
  /** Value that applies when unset ("none" when the feature is simply off). */
  fallback: string
  /** True when the value must not be echoed anywhere. Nothing prints values regardless; this is documentation. */
  secret?: boolean
  /** Returns true when a non-empty value is acceptable. */
  valid?: (value: string) => boolean
}

const host = (v: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v) && !v.includes('/')
const hostList = (v: string) => v.split(',').every((h) => host(h.trim()))
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const httpsOrigin = (v: string) => {
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash
  } catch {
    return false
  }
}
const month = (v: string) => /^(?:[1-9]|1[0-2])$/.test(v)
const tz = (v: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v })
    return true
  } catch {
    return false
  }
}
const locale = (v: string) => {
  try {
    return Intl.getCanonicalLocales(v).length === 1
  } catch {
    return false
  }
}
const postgres = (v: string) => /^postgres(ql)?:\/\//.test(v)
const longSecret = (v: string) => v.length >= 32
const oneOf = (...a: string[]) => (v: string) => a.includes(v)
const slug = (v: string) => /^[a-z0-9-]{2,40}$/.test(v)
const cookiePrefix = (v: string) => /^[a-z0-9]{2,12}$/i.test(v)
const googleFile = (v: string) => /^google[a-f0-9]{16}\.html$/.test(v)

export const ENV_MANIFEST: readonly EnvEntry[] = [
  { name: 'DATABASE_URI', group: 'Database and secrets', required: true, what: 'Postgres connection string (pooled on Vercel).', where: 'payload.config.ts', fallback: 'none', secret: true, valid: postgres },
  { name: 'DATABASE_URI_UNPOOLED', group: 'Database and secrets', required: true, what: 'Direct (not pooled) Postgres URL used to run migrations during the build.', where: 'scripts/vercel-build.mjs', fallback: 'none', secret: true, valid: postgres },
  { name: 'PAYLOAD_SECRET', group: 'Database and secrets', required: true, what: 'Random secret (32 or more characters) that signs sessions and links.', where: 'payload.config.ts, lib/secrets.ts', fallback: 'none', secret: true, valid: longSecret },
  { name: 'PROD_DATABASE_HOST', group: 'Database and secrets', required: true, what: 'The production database host name (not a secret); the build refuses to deploy when it is empty.', where: 'scripts/vercel-build.mjs', fallback: 'none', valid: host },
  { name: 'CRON_SECRET', group: 'Database and secrets', required: true, what: 'Shared secret the scheduled jobs present to the cron routes.', where: 'app/api/cron/*', fallback: 'none', secret: true, valid: longSecret },
  { name: 'BLOB_READ_WRITE_TOKEN', group: 'Database and secrets', required: true, what: 'Vercel Blob token for uploaded files (set by the Blob store on Vercel; never set locally).', where: 'payload.config.ts, payload/env.ts', fallback: 'files go to ./media', secret: true },

  { name: 'CLUB_PRESET', group: 'Template', required: false, what: 'Which built-in copy set applies: "template" (neutral, the default outside development) or "lang-lang".', where: 'payload/seed/club-defaults.ts', fallback: 'template', valid: oneOf('template', 'lang-lang') },
  { name: 'CANONICAL_HOST', group: 'Club identity', required: true, what: 'The club site host, for example riverbend-cc.example (no https://). Canonical links, redirects and the sitemap use it.', where: 'config/site.ts, next.config.ts', fallback: 'none (production)', valid: host },
  { name: 'REDIRECT_HOSTS', group: 'Club identity', required: false, what: 'Comma separated hosts that 308 to the canonical host (www and the vercel.app alias).', where: 'next.config.ts', fallback: 'www.<CANONICAL_HOST>', valid: hostList },
  { name: 'COOKIE_PREFIX', group: 'Club identity', required: true, what: 'Short prefix for visitor cookie names (letters and digits).', where: 'config/site.ts', fallback: 'club (production), none required in development', valid: cookiePrefix },
  { name: 'EXPORT_FILENAME_PREFIX', group: 'Club identity', required: false, what: 'Prefix of downloaded CSV file names.', where: 'config/site.ts', fallback: 'derived from the club short name', valid: (v) => /^[a-z0-9-]{1,30}$/i.test(v) },
  { name: 'VOTE_LABEL', group: 'Club identity', required: false, what: 'The name of the best-player award in the UI.', where: 'config/site.ts', fallback: 'Best player' },
  { name: 'AGENCY_CREDIT', group: 'Template', required: false, what: 'Set to "off" to hide the operator credit in the footer.', where: 'config/site.ts', fallback: 'shown', valid: oneOf('on', 'off') },
  { name: 'GOOGLE_SITE_VERIFICATION_FILE', group: 'Template', required: false, what: 'File name from Google Search Console (googleXXXXXXXXXXXXXXXX.html); the site serves it at that address.', where: 'config/site.ts, app/api/google-verification', fallback: 'not served', valid: googleFile },

  { name: 'PLAYHQ_ORG_ID', group: 'PlayHQ', required: true, what: "The club's PlayHQ organisation id (a UUID).", where: 'config/site.ts', fallback: 'none (production)', valid: uuid },
  { name: 'PLAYHQ_TEAM_PREFIX', group: 'PlayHQ', required: true, what: 'Club name as PlayHQ puts it before team names; stripped for display.', where: 'config/site.ts', fallback: 'none (production)' },
  { name: 'PLAYHQ_CLIENT_ID', group: 'PlayHQ', required: false, what: 'PlayHQ API client id; without it fixtures sync is off.', where: 'lib/playhq/client.ts', fallback: 'none (sync off)', secret: true },
  { name: 'PLAYHQ_TENANT', group: 'PlayHQ', required: false, what: 'PlayHQ tenant code of the national body (ca for Cricket Australia).', where: 'lib/playhq/client.ts', fallback: 'ca' },
  { name: 'PLAYHQ_CLUB_URL', group: 'PlayHQ', required: false, what: "The club's public PlayHQ page, for fixture links.", where: 'config/site.ts', fallback: 'https://www.playhq.com', valid: (v) => /^https:\/\//.test(v) },

  { name: 'CLUB_TIMEZONE', group: 'Region and season', required: true, what: 'IANA timezone for event dates and structured data, for example Australia/Sydney.', where: 'config/site.ts', fallback: 'Australia/Melbourne', valid: tz },
  { name: 'CLUB_LOCALE', group: 'Region and season', required: true, what: 'Language and region for dates, for example en-AU.', where: 'config/site.ts', fallback: 'en-AU', valid: locale },
  { name: 'CLUB_COUNTRY', group: 'Region and season', required: false, what: 'Two-letter country for phone numbers and the privacy notice.', where: 'config/site.ts', fallback: 'region of CLUB_LOCALE', valid: (v) => /^[A-Za-z]{2}$/.test(v) },
  { name: 'SEASON_START_MONTH', group: 'Region and season', required: true, what: 'Month the season starts (1 to 12).', where: 'config/site.ts', fallback: '7', valid: month },
  { name: 'SEASON_NAME_FORMAT', group: 'Region and season', required: false, what: '"split" names a season 2025/26, "single" names it 2026.', where: 'config/site.ts', fallback: 'split', valid: oneOf('split', 'single') },
  { name: 'OFFICE_CURRENCY', group: 'Region and season', required: false, what: 'Currency code for the club office (must have cents).', where: 'config/site.ts', fallback: 'AUD', valid: (v) => /^[A-Za-z]{3}$/.test(v) },
  { name: 'OFFICE_LOCALE', group: 'Region and season', required: false, what: 'Language and region for office amounts and dates.', where: 'config/site.ts', fallback: 'CLUB_LOCALE', valid: locale },

  { name: 'AUTH_BROKER_ORIGIN', group: 'Sign-in', required: false, what: "Origin of the shared sign-in broker (https). Facebook sign-in through the broker is off while empty.", where: 'lib/signin/broker.ts', fallback: 'off', valid: httpsOrigin },
  { name: 'AUTH_BROKER_CLUB_ID', group: 'Sign-in', required: false, what: "This club's id in the broker's CLUBS list.", where: 'lib/signin/broker.ts', fallback: 'off', valid: slug },
  { name: 'FACEBOOK_APP_ID', group: 'Sign-in', required: false, what: "The club's own Meta app id (an alternative to the broker).", where: 'lib/facebook-login.ts', fallback: 'off' },
  { name: 'FACEBOOK_APP_SECRET', group: 'Sign-in', required: false, what: "The club's own Meta app secret.", where: 'lib/facebook-login.ts', fallback: 'off', secret: true },

  { name: 'EMAIL_PROVIDER', group: 'Email', required: false, what: '"resend" for real mail ("mock" for demos). Email is off while empty.', where: 'lib/email/env.ts', fallback: 'off', valid: oneOf('resend', 'mock') },
  { name: 'EMAIL_FROM_ADDRESS', group: 'Email', required: false, what: 'The sender address (its domain needs SPF, DKIM and DMARC records).', where: 'lib/email/env.ts', fallback: 'off', valid: (v) => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(v) },
  { name: 'RESEND_API_KEY', group: 'Email', required: false, what: 'Resend API key.', where: 'lib/email/env.ts', fallback: 'off', secret: true },

  { name: 'AI_GATEWAY_API_KEY', group: 'Optional services', required: false, what: 'Vercel AI Gateway key for the yearbook draft helper; drafting is off while empty.', where: 'lib/yearbooks/ai', fallback: 'off', secret: true },
  { name: 'FACEBOOK_PAGE_ID', group: 'Optional services', required: false, what: 'Facebook Page for social posting.', where: 'lib/social/adapters', fallback: 'off' },
  { name: 'FACEBOOK_PAGE_ACCESS_TOKEN', group: 'Optional services', required: false, what: 'Page access token for social posting.', where: 'lib/social/adapters', fallback: 'off', secret: true },
]

export type EnvStatus = 'set' | 'missing' | 'invalid' | 'default'
export type EnvReport = { name: string; group: EnvGroup; required: boolean; status: EnvStatus }

/** Status of every manifest entry in `env`. Names and statuses only: a value is never copied into the result. */
export function checkEnv(env: Record<string, string | undefined> = process.env, manifest: readonly EnvEntry[] = ENV_MANIFEST): EnvReport[] {
  return manifest.map((e) => {
    const v = env[e.name]?.trim()
    let status: EnvStatus
    if (!v) status = e.required ? 'missing' : 'default'
    else status = e.valid && !e.valid(v) ? 'invalid' : 'set'
    return { name: e.name, group: e.group, required: e.required, status }
  })
}

/** True when a required variable is missing or any set variable is invalid. */
export const envProblems = (reports: readonly EnvReport[]): EnvReport[] => reports.filter((r) => r.status === 'invalid' || (r.required && r.status === 'missing'))

/** Markdown table rows shared by the checklist doc and the generated env checklist. */
export function manifestMarkdown(manifest: readonly EnvEntry[] = ENV_MANIFEST): string {
  const rows = manifest.map((e) => `| \`${e.name}\` | ${e.group} | ${e.required ? 'Required' : 'Optional'} | ${e.what} | \`${e.where}\` | ${e.fallback} |`)
  return ['| Variable | Group | Need | What it does | Read in | When unset |', '| --- | --- | --- | --- | --- | --- |', ...rows].join('\n')
}

/** The per-club checklist: every variable with its status in `env` (names only). */
export function envChecklistMarkdown(clubName: string, env: Record<string, string | undefined> = process.env, manifest: readonly EnvEntry[] = ENV_MANIFEST): string {
  const status = new Map(checkEnv(env, manifest).map((r) => [r.name, r.status]))
  const label: Record<EnvStatus, string> = { set: 'set', missing: 'MISSING', invalid: 'INVALID', default: 'not set (uses the default)' }
  const rows = manifest.map((e) => `| \`${e.name}\` | ${e.required ? 'Required' : 'Optional'} | ${label[status.get(e.name) ?? 'default']} | ${e.what} | \`${e.where}\` |`)
  return [
    `# Environment checklist for ${clubName}`,
    '',
    'Generated by `pnpm bootstrap:club`. It lists names and status only, never values. Set these in the hosting project (Vercel > Settings > Environment Variables) for Production and Preview, then run `pnpm check:template` to confirm.',
    '',
    '| Variable | Need | Status here | What it does | Read in |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}
