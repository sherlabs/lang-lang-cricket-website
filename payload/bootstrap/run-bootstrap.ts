/**
 * Stands a club's site up from its profile (wave F spec 5.4). The orchestration lives here so the integration test and the
 * `bootstrap:club` script share it; the script file is only argument parsing and the safety guard. No network call is made:
 * no PlayHQ, no broker, no email.
 *
 * Dry run is the default (`confirm: false`): everything is validated and read, nothing is written. A confirmed run seeds the
 * globals from the profile, creates the first admin and uploads the assets. It fills only EMPTY fields and never overwrites a saved
 * non-empty value, never deletes anything and never resets an existing admin, so a re-run (with `force`) cannot undo a committee's edits.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { BROKER_EVENTS_PATH, RESERVED_COOKIE_PREFIXES, selectorPaths } from '../../config/site'
import { envChecklistMarkdown } from '../../config/env-manifest'
import { DEFAULT_SPONSOR_CAROUSEL_TIERS } from '../../lib/site-settings-core'
import { ASSET_KEYS, profileDefaults, resolveProfileTheme, type AssetKey, type ClubProfile } from '../../lib/club-profile'
import { toClubGlobal } from '../seed/club-template'
import { SOCIAL_DEFAULTS } from '../seed/social-defaults'
import { migrations } from '../migrations'

export type BootstrapOptions = {
  confirm: boolean
  force?: boolean
  skipAdmin?: boolean
  skipAssets?: boolean
  /** The folder holding the profile (`clubs/<slug>/`); asset paths resolve against it. */
  baseDir: string
  env?: Record<string, string | undefined>
  /** The first admin's password (from `INITIAL_ADMIN_PASSWORD`; never from the profile). */
  adminPassword?: string
  /** Where to write the generated env checklist on a confirmed run (omit to skip). */
  checklistPath?: string
}

export type FieldAction = 'fill' | 'keep' | 'skip'
export type FieldDiff = { global: string; path: string; saved: string; profile: string; action: FieldAction }
export type GlobalPlan = { slug: string; saved: boolean; diffs: FieldDiff[] }
export type AssetPlan = { key: AssetKey; file: string; action: 'upload' | 'uploaded' | 'kept' | 'skipped'; reason?: string }
export type BootstrapReport = {
  mode: 'dry-run' | 'applied' | 'refused'
  /** Why nothing was written (refused), or what a confirmed run would be refused for (dry run). */
  refusal: string | null
  /** Environment values that disagree with the profile. They block a confirmed run. */
  envProblems: string[]
  migrations: { pending: number | null; ran: number }
  globals: GlobalPlan[]
  admin: 'create' | 'created' | 'exists' | 'skipped' | 'no-password'
  assets: AssetPlan[]
  notes: string[]
  envLines: string[]
  nextSteps: string[]
}

const short = (v: unknown): string => {
  const s = Array.isArray(v) ? `[${v.length} item${v.length === 1 ? '' : 's'}]` : typeof v === 'object' && v !== null ? '{…}' : String(v ?? '')
  return s.length > 60 ? `${s.slice(0, 57)}...` : s
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
const idOf = (v: unknown): unknown => (isObj(v) && 'id' in v ? v.id : v)

/**
 * Compare the values a profile would write against a saved global. Pure. A field is filled when the global has never been saved or
 * the saved value is empty; a saved non-empty value is always kept; a field the profile has no value for is skipped.
 */
export function planFill(slug: string, saved: Record<string, unknown> | null, desired: Record<string, unknown>): { plan: GlobalPlan; patch: Record<string, unknown> } {
  const isSaved = Boolean(saved && saved.updatedAt)
  const diffs: FieldDiff[] = []
  const patch: Record<string, unknown> = {}
  const walk = (want: Record<string, unknown>, have: Record<string, unknown> | undefined, out: Record<string, unknown>, prefix: string) => {
    for (const [k, w] of Object.entries(want)) {
      const at = prefix ? `${prefix}.${k}` : k
      if (isObj(w)) {
        const child: Record<string, unknown> = {}
        walk(w, isObj(have?.[k]) ? (have![k] as Record<string, unknown>) : undefined, child, at)
        if (Object.keys(child).length) out[k] = child
        continue
      }
      const cur = idOf(have?.[k])
      if (isEmpty(w)) {
        diffs.push({ global: slug, path: at, saved: short(cur), profile: '', action: 'skip' })
        continue
      }
      if (!isSaved || isEmpty(cur)) {
        out[k] = w
        diffs.push({ global: slug, path: at, saved: short(cur), profile: short(w), action: 'fill' })
      } else diffs.push({ global: slug, path: at, saved: short(cur), profile: short(w), action: 'keep' })
    }
  }
  walk(desired, isSaved ? saved! : undefined, patch, '')
  return { plan: { slug, saved: isSaved, diffs }, patch }
}

/** Environment values that must agree with the profile before a club goes live. */
export function envProblemsFor(profile: ClubProfile, env: Record<string, string | undefined>): string[] {
  const problems: string[] = []
  const hostOf = (u: string) => {
    try {
      return new URL(u).host
    } catch {
      return ''
    }
  }
  const siteHost = hostOf(profile.club.siteUrl)
  const canon = env.CANONICAL_HOST?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!canon) problems.push(`CANONICAL_HOST is not set (it should be ${siteHost}).`)
  else if (canon !== siteHost) problems.push(`CANONICAL_HOST (${canon}) does not match the profile's site address host (${siteHost}).`)
  const cookie = env.COOKIE_PREFIX?.trim()
  if (!cookie) problems.push('COOKIE_PREFIX is not set (a short prefix for visitor cookies).')
  else if (RESERVED_COOKIE_PREFIXES.includes(cookie.toLowerCase())) problems.push(`COOKIE_PREFIX is "${cookie}", which belongs to another club. Pick your own prefix.`)
  if (env.PLAYHQ_ORG_ID?.trim() !== profile.playhq.orgId) problems.push(`PLAYHQ_ORG_ID ${env.PLAYHQ_ORG_ID?.trim() ? 'does not match' : 'is not set; it should match'} the profile's playhq.orgId.`)
  if (env.PLAYHQ_TEAM_PREFIX?.trim() !== profile.playhq.teamPrefix) problems.push(`PLAYHQ_TEAM_PREFIX ${env.PLAYHQ_TEAM_PREFIX?.trim() ? 'does not match' : 'is not set; it should match'} the profile's playhq.teamPrefix.`)
  if (env.CLUB_PRESET?.trim() === 'lang-lang') problems.push('CLUB_PRESET is "lang-lang"; a new club uses the neutral "template" copy.')
  return problems
}

export function envLinesFor(profile: ClubProfile): string[] {
  const host = new URL(profile.club.siteUrl).host
  const prefix = profile.club.shortName.toLowerCase().replace(/\bcc\b|\bcricket club\b/g, '').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'club'
  return [
    `CLUB_PRESET=template`,
    `CANONICAL_HOST=${host}`,
    `REDIRECT_HOSTS=www.${host}`,
    `COOKIE_PREFIX=${prefix}`,
    `PLAYHQ_ORG_ID=${profile.playhq.orgId}`,
    `PLAYHQ_TEAM_PREFIX=${profile.playhq.teamPrefix}`,
    ...(profile.playhq.clubUrl ? [`PLAYHQ_CLUB_URL=${profile.playhq.clubUrl}`] : []),
    `CLUB_TIMEZONE=${profile.region.timezone}`,
    `CLUB_LOCALE=${profile.region.locale}`,
    `CLUB_COUNTRY=${profile.club.country}`,
    `SEASON_START_MONTH=${profile.region.seasonStartMonth}`,
    `SEASON_NAME_FORMAT=${profile.region.seasonNameFormat}`,
    `OFFICE_CURRENCY=${profile.office?.currency ?? profile.region.currency}`,
  ]
}

/** The broker `CLUBS` entry for this site (registered in the broker's own configuration, not here). */
export function brokerEntryFor(profile: ClubProfile): Record<string, unknown> {
  return { origins: [new URL(profile.club.siteUrl).origin], returnPath: selectorPaths.facebookBrokerCallback, eventsPath: BROKER_EVENTS_PATH }
}

async function pendingMigrations(payload: Payload): Promise<number | null> {
  const total = migrations.length
  try {
    const res = await payload.find({ collection: 'payload-migrations' as never, limit: 500, depth: 0, pagination: false, overrideAccess: true })
    const ran = new Set((res.docs as unknown as { name: string }[]).map((d) => d.name))
    return migrations.filter((m) => !ran.has(m.name)).length
  } catch {
    return total
  }
}

/**
 * What to do with one asset. A Blob token off Vercel is only accepted with `ALLOW_REMOTE_BLOB=yes`; without it the upload is skipped and the
 * operator is told to upload in the admin instead. Pure.
 */
export function assetDecision(o: { skipAssets: boolean; blobToken: boolean; allowRemoteBlob: boolean; already: boolean }): { action: 'upload' | 'kept' | 'skipped'; reason?: string } {
  if (o.skipAssets) return { action: 'skipped', reason: '--skip-assets' }
  if (o.blobToken && !o.allowRemoteBlob) return { action: 'skipped', reason: 'a Blob token is set but ALLOW_REMOTE_BLOB=yes is not' }
  if (o.already) return { action: 'kept', reason: 'already set in Club details' }
  return { action: 'upload' }
}

const CTX = { disableRevalidate: true } as const

async function readGlobal(payload: Payload, slug: string): Promise<Record<string, unknown> | null> {
  try {
    return (await payload.findGlobal({ slug: slug as never, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
  } catch {
    return null
  }
}

export async function runBootstrap(payload: Payload, profile: ClubProfile, opts: BootstrapOptions): Promise<BootstrapReport> {
  const env = opts.env ?? process.env
  const defaults = profileDefaults(profile)
  const report: BootstrapReport = {
    mode: opts.confirm ? 'applied' : 'dry-run',
    refusal: null,
    envProblems: envProblemsFor(profile, env),
    migrations: { pending: null, ran: 0 },
    globals: [],
    admin: 'skipped',
    assets: [],
    notes: [],
    envLines: envLinesFor(profile),
    nextSteps: [],
  }
  const pending = await pendingMigrations(payload)
  report.migrations.pending = pending
  const blank = (pending ?? 0) > 0

  // 1. Migrate a blank database (confirmed runs only; a dry run just reports the count).
  if (opts.confirm && blank && !report.envProblems.length) {
    await payload.db.migrate()
    report.migrations.ran = pending ?? 0
  }
  const ready = !blank || report.migrations.ran > 0

  // 2. What is already there.
  let hasClub = false
  let hasUsers = false
  if (ready) {
    const club = await readGlobal(payload, 'club')
    hasClub = Boolean(club?.updatedAt)
    hasUsers = (await payload.count({ collection: 'users', overrideAccess: true })).totalDocs > 0
  }
  if ((hasClub || hasUsers) && !opts.force) {
    report.refusal = `This database already has ${[hasClub ? 'a saved Club details record' : '', hasUsers ? 'users' : ''].filter(Boolean).join(' and ')}, so nothing was changed. Re-run with --force to fill only the fields that are still empty (saved values are never overwritten).`
  }

  // 3. Assets (decide, then upload on a confirmed run).
  const clubSaved = ready ? await readGlobal(payload, 'club') : null
  const slotFor: Record<AssetKey, string> = { logo: 'logo', hero: 'heroImage', ogImage: 'ogImage', favicon: 'favicon' }
  const mediaIds: Partial<Record<string, number>> = {}
  const blobToken = Boolean(env.BLOB_READ_WRITE_TOKEN?.trim())
  const altFor: Record<AssetKey, string> = { logo: `${defaults.name} crest`, hero: defaults.home.hero.imageAlt, ogImage: defaults.ogImageAlt, favicon: `${defaults.name} icon` }
  let blobSkipped = false
  for (const key of ASSET_KEYS) {
    const rel = profile.assets[key]
    if (!rel) continue
    const slot = slotFor[key]
    const already = Boolean(clubSaved?.updatedAt) && !isEmpty(idOf(clubSaved?.[slot]))
    const decision = assetDecision({ skipAssets: Boolean(opts.skipAssets), blobToken, allowRemoteBlob: env.ALLOW_REMOTE_BLOB === 'yes', already })
    if (decision.action === 'skipped' && decision.reason !== 'already set in Club details') blobSkipped = true
    report.assets.push({ key, file: rel, action: decision.action, ...(decision.reason ? { reason: decision.reason } : {}) })
  }
  if (opts.skipAssets || blobSkipped) {
    report.notes.push('Assets skipped: upload them in the admin (Media library), then set the logo, favicon and share image under Club details.')
  }
  const willWrite = opts.confirm && !report.refusal && !report.envProblems.length && ready
  if (willWrite) {
    for (const a of report.assets) {
      if (a.action !== 'upload') continue
      if (!existsSync(path.join(opts.baseDir, a.file))) {
        a.action = 'skipped'
        a.reason = 'file not found'
        continue
      }
      const doc = await payload.create({ collection: 'media', data: { alt: altFor[a.key] }, filePath: path.join(opts.baseDir, a.file), overrideAccess: true, context: CTX })
      mediaIds[slotFor[a.key]] = doc.id as number
      a.action = 'uploaded'
    }
  }

  // 4. The globals: desired values from the profile, compared with what is saved.
  const theme = resolveProfileTheme(profile.theme)
  const clubDesired: Record<string, unknown> = { ...toClubGlobal(defaults), honourKeywords: [] }
  for (const [slot, id] of Object.entries(mediaIds)) clubDesired[slot] = id
  const social = {
    defaultStyle: SOCIAL_DEFAULTS.defaultStyle,
    hashtags: [{ tag: defaults.shortName.replace(/[^\p{L}\p{N}]/gu, '') }, ...SOCIAL_DEFAULTS.hashtags.map((tag) => ({ tag }))],
    signOff: SOCIAL_DEFAULTS.signOff,
  }
  const desired: { slug: string; data: Record<string, unknown> }[] = [
    { slug: 'club', data: clubDesired },
    { slug: 'theme', data: { palette: theme.palette, shades: theme.shades, headingFont: theme.headingFont } },
    { slug: 'social-settings', data: social },
    { slug: 'office-settings', data: { currency: profile.office?.currency ?? profile.region.currency, locale: profile.region.locale } },
    { slug: 'site-settings', data: { sponsorCarouselTiers: [...DEFAULT_SPONSOR_CAROUSEL_TIERS] } },
  ]
  for (const g of desired) {
    const saved = ready ? await readGlobal(payload, g.slug) : null
    const { plan, patch } = planFill(g.slug, saved, g.data)
    report.globals.push(plan)
    if (willWrite && Object.keys(patch).length) {
      await payload.updateGlobal({ slug: g.slug as never, data: patch as never, overrideAccess: true, context: CTX })
    }
  }

  // 5. The first admin.
  if (!opts.skipAdmin) {
    const existing = ready ? await payload.find({ collection: 'users', where: { email: { equals: profile.admin.email } }, limit: 1, depth: 0, overrideAccess: true }) : null
    if (existing?.docs.length) report.admin = 'exists'
    else if (!opts.adminPassword) report.admin = 'no-password'
    else if (willWrite) {
      await payload.create({
        collection: 'users',
        data: { email: profile.admin.email, password: opts.adminPassword, role: 'admin', name: profile.admin.name },
        overrideAccess: true,
        context: { seedAdmin: true, ...CTX },
      })
      report.admin = 'created'
    } else report.admin = 'create'
    if (report.admin === 'no-password') report.notes.push('No admin was created: set INITIAL_ADMIN_PASSWORD in your shell (never in the profile) and run again with --force, or use pnpm seed:admin.')
  }

  // 6. Outcome and next steps.
  if (opts.confirm && (report.refusal || report.envProblems.length || !ready)) report.mode = 'refused'
  if (report.mode === 'applied' && opts.checklistPath) {
    mkdirSync(path.dirname(opts.checklistPath), { recursive: true })
    writeFileSync(opts.checklistPath, envChecklistMarkdown(profile.club.name, env))
  }
  report.nextSteps = [
    'Set these variables on the host for Production and Preview (Vercel > Settings > Environment Variables), then run pnpm check:template:',
    ...report.envLines.map((l) => `  ${l}`),
    `Register this site in the shared sign-in broker's CLUBS list as "<club-id>": ${JSON.stringify(brokerEntryFor(profile))}, then set AUTH_BROKER_ORIGIN and AUTH_BROKER_CLUB_ID.`,
    'Cron schedules come from vercel.json; set CRON_SECRET on the host. Point your DNS at the host and add the apex/www redirect.',
    'Do not run pnpm seed:demo against a live club: it fills the site with example people and results.',
  ]
  return report
}

/** Plain-text rendering of a report for the terminal. */
export function formatReport(r: BootstrapReport): string {
  const out: string[] = []
  out.push(r.mode === 'dry-run' ? 'DRY RUN: nothing was written. Re-run with --confirm to apply.' : r.mode === 'refused' ? 'REFUSED: nothing was written.' : 'APPLIED.')
  if (r.refusal) out.push(`  ${r.refusal}`)
  out.push(`Migrations: ${r.migrations.pending === null ? 'unknown' : `${r.migrations.pending} pending`}${r.migrations.ran ? `, ${r.migrations.ran} ran` : ''}`)
  for (const p of r.envProblems) out.push(`Environment problem: ${p}`)
  for (const g of r.globals) {
    out.push(`Global ${g.slug}: ${g.saved ? 'already saved' : 'not saved yet'}`)
    if (g.saved) for (const d of g.diffs) out.push(`  ${d.action.padEnd(4)} ${d.path}  saved="${d.saved}"  profile="${d.profile}"`)
    else out.push(`  ${g.diffs.filter((d) => d.action === 'fill').length} field(s) would be filled`)
  }
  out.push(`Admin: ${r.admin}`)
  for (const a of r.assets) out.push(`Asset ${a.key}: ${a.action}${a.reason ? ` (${a.reason})` : ''}`)
  for (const n of r.notes) out.push(n)
  out.push('Next steps:', ...r.nextSteps.map((s) => (s.startsWith('  ') ? s : `- ${s}`)))
  return out.join('\n')
}
