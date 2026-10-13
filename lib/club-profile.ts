/**
 * The club profile (wave F spec 5.3): one JSON file that describes a club well enough for `pnpm bootstrap:club` to stand its
 * site up. Pure: `validateClubProfile` returns typed per-field errors and never reads a file (asset checks go through an
 * injected `statAsset`, so unit tests need no disk). JSON only, so the script needs no new dependency; a `_comment` key is ignored.
 *
 * A profile never carries a password (any key named `password` is rejected). The first admin's password comes from
 * `INITIAL_ADMIN_PASSWORD`, as for `seed:admin`.
 */
import { isTwoDecimalCurrency } from './office/money'
import { checkTheme, colorsFromForm } from './theme/contrast'
import { suggestShades } from './theme/derive'
import { FONT_KEYS, type FontKey } from './theme/tokens'
import { seedColors } from './theme/seed-colors'
import { THEME_DEFAULTS } from '@/payload/seed/theme-defaults'
import { buildClubDefaults, SOCIAL_PLATFORMS, type ClubDefaults, type ClubIdentity, type SocialPlatform } from '@/payload/seed/club-template'

export type ProfileError = { path: string; message: string }
export type AssetKey = 'logo' | 'hero' | 'ogImage' | 'favicon'
export const ASSET_KEYS: readonly AssetKey[] = ['logo', 'hero', 'ogImage', 'favicon']
const ASSET_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'ico'])
/** Largest accepted asset (bytes); share images are kept smaller so link previews stay fast. */
export const ASSET_MAX_BYTES: Record<AssetKey, number> = { logo: 2_000_000, hero: 5_000_000, ogImage: 1_000_000, favicon: 500_000 }

export type ClubProfile = {
  club: {
    name: string
    shortName: string
    familiarName?: string
    tagline: string
    location: string
    region: string
    country: string
    sport: string
    email: string
    siteUrl: string
    socials: { platform: SocialPlatform; url: string; label: string }[]
    supportedBy?: string
  }
  region: { locale: string; timezone: string; currency: string; seasonStartMonth: number; seasonNameFormat: 'split' | 'single' }
  theme: { accent: string; primary: string; surface: string; text: string; muted: string; headingFont: FontKey }
  playhq: { orgId: string; teamPrefix: string; clubUrl?: string }
  office?: { currency?: string }
  admin: { email: string; name: string }
  assets: Partial<Record<AssetKey, string>>
  /** Optional overrides of the neutral copy, merged over `buildClubDefaults` (same shape as `ClubDefaults`, every key optional). */
  copy?: Record<string, unknown>
}

export type ProfileResult = { ok: true; profile: ClubProfile; warnings: string[] } | { ok: false; errors: ProfileError[] }
export type AssetStat = { size: number } | null
export type ValidateOptions = { statAsset?: (relativePath: string) => AssetStat }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HEX6 = /^#[0-9a-fA-F]{6}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every path at which a key named `password` (any case) appears. */
function passwordKeys(v: unknown, at = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => passwordKeys(x, `${at}[${i}]`))
  if (!isObj(v)) return []
  return Object.entries(v).flatMap(([k, x]) => [...(/password/i.test(k) ? [at ? `${at}.${k}` : k] : []), ...passwordKeys(x, at ? `${at}.${k}` : k)])
}

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
function validLocale(l: string): boolean {
  try {
    return Intl.getCanonicalLocales(l).length === 1
  } catch {
    return false
  }
}

/** An asset path stays inside `clubs/<slug>/`: relative, no `..`, no backslash, no scheme. */
export function assetPathProblem(p: string): string | null {
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || /^[a-z][a-z0-9+.-]*:/i.test(p)) return 'must be a relative path inside the club folder'
  if (p.includes('\\') || p.includes('\0')) return 'must not contain backslashes'
  if (p.split('/').some((seg) => seg === '..' || seg === '')) return 'must stay inside the club folder (no "..")'
  return null
}

/** Identity values come from the `club` and `region` sections (they feed the https check, the host cross-check and the env lines), so `copy` may not restate them. */
const COPY_IDENTITY_KEYS = new Set(['name', 'shortName', 'familiarName', 'tagline', 'sport', 'siteUrl', 'locale', 'ogLocale', 'email', 'address', 'teamNamePrefix', 'socials', 'assets'])
const typeOf = (v: unknown): string => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v)

/** Walks `value` against the shape of `ref` (the neutral defaults): unknown keys and wrong types are problems. Arrays are checked per item against the first reference item. */
function shapeProblems(value: unknown, ref: unknown, at: string, out: ProfileError[]): void {
  const want = typeOf(ref)
  if (typeOf(value) !== want) return void out.push({ path: at, message: `Must be ${want === 'array' ? 'a list' : `a ${want}`}.` })
  if (Array.isArray(value) && Array.isArray(ref)) {
    // An empty reference list (honourKeywords) holds plain text.
    value.forEach((v, i) => shapeProblems(v, ref[0] ?? '', `${at}[${i}]`, out))
  } else if (isObj(value) && isObj(ref)) {
    for (const [k, v] of Object.entries(value)) {
      if (!(k in ref)) out.push({ path: `${at}.${k}`, message: 'Not a copy field. See docs/template/club-profile.md.' })
      else shapeProblems(v, ref[k], `${at}.${k}`, out)
    }
  }
}

/** Problems with the profile's `copy` overrides: identity keys, unknown keys and wrong types. */
export function copyProblems(copy: Record<string, unknown>): ProfileError[] {
  const out: ProfileError[] = []
  const reference = buildClubDefaults({
    name: 'N', shortName: 'N', location: 'L', sport: 'Cricket', siteUrl: 'https://example.org', locale: 'en-AU', ogLocale: 'en_AU', email: 'a@example.org',
    address: { locality: 'L', region: 'R', regionName: 'R', country: 'AU', countryName: 'Australia' }, teamNamePrefix: '',
  }) as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(copy)) {
    if (k === '_comment') continue
    if (COPY_IDENTITY_KEYS.has(k)) out.push({ path: `copy.${k}`, message: 'Identity is set in the club and region sections, not in copy.' })
    else if (!(k in reference)) out.push({ path: `copy.${k}`, message: 'Not a copy field. See docs/template/club-profile.md.' })
    else shapeProblems(v, reference[k], `copy.${k}`, out)
  }
  return out
}

export function validateClubProfile(json: unknown, opts: ValidateOptions = {}): ProfileResult {
  const errors: ProfileError[] = []
  const warnings: string[] = []
  const err = (path: string, message: string) => errors.push({ path, message })
  if (!isObj(json)) return { ok: false, errors: [{ path: '', message: 'The profile must be a JSON object.' }] }
  for (const p of passwordKeys(json)) err(p, 'A profile must not contain a password. Set INITIAL_ADMIN_PASSWORD in the environment instead.')

  const c = isObj(json.club) ? json.club : (err('club', 'Required section.'), {})
  const name = str(c.name) ?? (err('club.name', 'Required.'), '')
  const shortName = str(c.shortName) ?? (err('club.shortName', 'Required.'), '')
  const location = str(c.location) ?? (err('club.location', 'Required (the town or suburb).'), '')
  const region = str(c.region) ?? (err('club.region', 'Required (the state or region name).'), '')
  const tagline = str(c.tagline) ?? (location && region ? `${location}, ${region}` : '')
  const country = str(c.country)?.toUpperCase() ?? ''
  if (!/^[A-Z]{2}$/.test(country)) err('club.country', 'Use a two-letter country code such as AU.')
  const email = str(c.email) ?? ''
  if (!EMAIL_RE.test(email)) err('club.email', 'Enter a valid email address.')
  const siteUrl = (str(c.siteUrl) ?? '').replace(/\/+$/, '')
  try {
    const u = new URL(siteUrl)
    if (u.protocol !== 'https:') err('club.siteUrl', 'Must start with https://.')
    else if (u.pathname !== '/' || u.search || u.hash) err('club.siteUrl', 'Must be the site address only, with no path.')
  } catch {
    err('club.siteUrl', 'Enter the full site address, for example https://example-cc.org.')
  }
  const socialsRaw = c.socials === undefined ? [] : c.socials
  const socials: ClubProfile['club']['socials'] = []
  if (!Array.isArray(socialsRaw)) err('club.socials', 'Must be a list.')
  else {
    socialsRaw.forEach((s, i) => {
      const o = isObj(s) ? s : {}
      const platform = str(o.platform) as SocialPlatform | undefined
      if (!platform || !SOCIAL_PLATFORMS.includes(platform)) return err(`club.socials[${i}].platform`, `One of ${SOCIAL_PLATFORMS.join(', ')}.`)
      const url = str(o.url) ?? ''
      if (url && !/^https:\/\//i.test(url)) err(`club.socials[${i}].url`, 'Must start with https:// (or be empty).')
      socials.push({ platform, url, label: str(o.label) ?? '' })
    })
  }

  const r = isObj(json.region) ? json.region : (err('region', 'Required section.'), {})
  const locale = str(r.locale) ?? ''
  if (!validLocale(locale)) err('region.locale', 'Use a language and region such as en-AU or en-GB.')
  const timezone = str(r.timezone) ?? ''
  if (!validTimezone(timezone)) err('region.timezone', 'Use an IANA timezone such as Australia/Melbourne.')
  const currency = (str(r.currency) ?? '').toUpperCase()
  if (!isTwoDecimalCurrency(currency)) err('region.currency', 'Use a three-letter currency code that has cents, such as AUD, NZD, GBP or USD.')
  const seasonStartMonth = Number(r.seasonStartMonth)
  if (!Number.isInteger(seasonStartMonth) || seasonStartMonth < 1 || seasonStartMonth > 12) err('region.seasonStartMonth', 'A month number from 1 to 12.')
  const seasonNameFormat = r.seasonNameFormat === 'single' ? 'single' : r.seasonNameFormat === 'split' ? 'split' : (err('region.seasonNameFormat', 'Either "split" (2025/26) or "single" (2026).'), 'split')

  const t = isObj(json.theme) ? json.theme : (err('theme', 'Required section.'), {})
  const hex = (key: string, required: boolean): string | undefined => {
    const v = str(t[key])
    if (v === undefined) {
      if (required) err(`theme.${key}`, 'Required: a six digit hex colour (a # then six hex digits).')
      return undefined
    }
    if (!HEX6.test(v)) {
      err(`theme.${key}`, 'Use a six digit hex colour (a # then six hex digits).')
      return undefined
    }
    return v.toUpperCase()
  }
  const theme: ClubProfile['theme'] = { accent: hex('accent', true) ?? '', primary: '', surface: '', text: '', muted: '', headingFont: FONT_KEYS[0] }
  // Every colour role is required: a missing one would silently take Lang Lang's value from the seed defaults.
  for (const k of ['primary', 'surface', 'text', 'muted'] as const) {
    theme[k] = hex(k, true) ?? ''
  }
  const font = str(t.headingFont)
  if (font === undefined) err('theme.headingFont', `Required: one of ${FONT_KEYS.join(', ')}.`)
  else if (FONT_KEYS.includes(font as FontKey)) theme.headingFont = font as FontKey
  else err('theme.headingFont', `One of ${FONT_KEYS.join(', ')}.`)
  if (theme.accent && !errors.some((e) => e.path.startsWith('theme.'))) {
    const resolved = resolveProfileTheme(theme)
    for (const f of resolved.contrast.filter((x) => !x.pass && x.level === 'error')) {
      err(`theme.${f.fields[0]?.replace(/^palette\./, '').replace(/^shades\./, '') ?? 'accent'}`, `${f.label} is ${f.ratio.toFixed(1)} to 1; it needs ${f.min} to 1. Pick a different colour.`)
    }
    for (const f of resolved.contrast.filter((x) => !x.pass && x.level === 'warn')) warnings.push(`${f.label} is ${f.ratio.toFixed(1)} to 1 (aim for ${f.min}).`)
  }

  const p = isObj(json.playhq) ? json.playhq : (err('playhq', 'Required section.'), {})
  const orgId = str(p.orgId) ?? ''
  if (!UUID_RE.test(orgId)) err('playhq.orgId', 'The PlayHQ organisation id (a UUID).')
  const teamPrefix = str(p.teamPrefix) ?? (err('playhq.teamPrefix', 'Required: the club name as PlayHQ puts it before a team name.'), '')
  const clubUrl = str(p.clubUrl)
  if (clubUrl && !/^https:\/\//i.test(clubUrl)) err('playhq.clubUrl', 'Must start with https://.')

  let office: ClubProfile['office']
  if (json.office !== undefined) {
    if (!isObj(json.office)) err('office', 'Must be an object.')
    else {
      for (const k of Object.keys(json.office)) if (k !== 'currency' && k !== '_comment') err(`office.${k}`, 'Not supported. Only "currency" can be set from the profile; the rest is set in the admin.')
      const cur = str(json.office.currency)?.toUpperCase()
      if (cur && !isTwoDecimalCurrency(cur)) err('office.currency', 'Use a three-letter currency code that has cents.')
      office = cur ? { currency: cur } : {}
    }
  }

  const a = isObj(json.admin) ? json.admin : (err('admin', 'Required section.'), {})
  const adminEmail = str(a.email) ?? ''
  if (!EMAIL_RE.test(adminEmail)) err('admin.email', 'Enter a valid email address.')
  const adminName = str(a.name) ?? (err('admin.name', 'Required.'), '')

  const assets: ClubProfile['assets'] = {}
  if (json.assets !== undefined) {
    if (!isObj(json.assets)) err('assets', 'Must be an object.')
    else {
      for (const [k, v] of Object.entries(json.assets)) {
        if (k === '_comment') continue
        if (!ASSET_KEYS.includes(k as AssetKey)) {
          err(`assets.${k}`, `Unknown asset. Use ${ASSET_KEYS.join(', ')}.`)
          continue
        }
        const rel = str(v)
        if (!rel) {
          err(`assets.${k}`, 'Must be a relative file path.')
          continue
        }
        const bad = assetPathProblem(rel)
        const ext = rel.split('.').pop()?.toLowerCase() ?? ''
        if (bad) err(`assets.${k}`, `The path ${bad}.`)
        else if (!ASSET_EXT.has(ext)) err(`assets.${k}`, `Use a ${[...ASSET_EXT].join(', ')} file.`)
        else {
          if (opts.statAsset) {
            const st = opts.statAsset(rel)
            if (!st) err(`assets.${k}`, `The file ${rel} was not found.`)
            else if (st.size > ASSET_MAX_BYTES[k as AssetKey]) err(`assets.${k}`, `The file is ${(st.size / 1e6).toFixed(1)} MB; the limit is ${ASSET_MAX_BYTES[k as AssetKey] / 1e6} MB.`)
          }
          assets[k as AssetKey] = rel
        }
      }
    }
  }
  if (json.copy !== undefined) {
    if (!isObj(json.copy)) err('copy', 'Must be an object.')
    else for (const m of copyProblems(json.copy)) err(m.path, m.message)
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    warnings,
    profile: {
      club: {
        name,
        shortName,
        ...(str(c.familiarName) ? { familiarName: str(c.familiarName) } : {}),
        tagline,
        location,
        region,
        country,
        sport: str(c.sport) ?? 'Cricket',
        email,
        siteUrl,
        socials,
        ...(str(c.supportedBy) ? { supportedBy: str(c.supportedBy) } : {}),
      },
      region: { locale, timezone, currency, seasonStartMonth, seasonNameFormat },
      theme,
      playhq: { orgId, teamPrefix, ...(clubUrl ? { clubUrl } : {}) },
      ...(office ? { office } : {}),
      admin: { email: adminEmail, name: adminName },
      assets,
      ...(isObj(json.copy) ? { copy: json.copy } : {}),
    },
  }
}

/** The theme global's values for a profile: missing roles come from the shades are derived from the accent. */
export function resolveProfileTheme(theme: ClubProfile['theme']) {
  const palette = {
    primary: theme.primary,
    accent: theme.accent,
    surface: theme.surface,
    text: theme.text,
    muted: theme.muted,
  }
  const derived = suggestShades(palette.accent, palette.primary, palette.surface) ?? {}
  const shades = {
    ink: derived.ink ?? THEME_DEFAULTS.shades.ink,
    accentDark: derived.accentDark ?? THEME_DEFAULTS.shades.accentDark,
    accentLight: derived.accentLight ?? THEME_DEFAULTS.shades.accentLight,
    accentPale: derived.accentPale ?? THEME_DEFAULTS.shades.accentPale,
    accentDeep: derived.accentDeep ?? THEME_DEFAULTS.shades.accentDeep,
    surfaceMuted: derived.surfaceMuted ?? THEME_DEFAULTS.shades.surfaceMuted,
    mutedLight: palette.muted,
  }
  const contrast = checkTheme(colorsFromForm({ palette, shades }, seedColors()))
  return { palette, shades, headingFont: theme.headingFont, contrast }
}

/** `en-AU` gives `en_AU`. */
export const ogLocaleOf = (locale: string): string => locale.replace('-', '_')

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

export function profileIdentity(profile: ClubProfile): ClubIdentity {
  const { club, region, playhq } = profile
  return {
    name: club.name,
    shortName: club.shortName,
    ...(club.familiarName ? { familiarName: club.familiarName } : {}),
    location: club.tagline,
    sport: club.sport,
    siteUrl: club.siteUrl,
    locale: region.locale,
    ogLocale: ogLocaleOf(region.locale),
    email: club.email,
    address: { locality: club.location, region: club.region, regionName: club.region, country: club.country, countryName: countryName(club.country, region.locale) },
    teamNamePrefix: playhq.teamPrefix,
  }
}

/** The full defaults a bootstrap writes for this profile: neutral copy from the identity, then the profile's own `copy` overrides. */
export function profileDefaults(profile: ClubProfile): ClubDefaults {
  const overrides: Record<string, unknown> = { ...(profile.copy ?? {}) }
  delete overrides._comment
  if (profile.club.supportedBy) {
    const nav = (overrides.navigation && typeof overrides.navigation === 'object' ? overrides.navigation : {}) as Record<string, unknown>
    overrides.navigation = { fundingCredit: `Proudly supported by ${profile.club.supportedBy}.`, ...nav }
  }
  const d = buildClubDefaults(profileIdentity(profile), overrides as never)
  return { ...d, socials: profile.club.socials.length ? profile.club.socials.map((s) => ({ ...s, label: s.label || `Find us on ${s.platform}` })) : d.socials }
}
