import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ASSET_MAX_BYTES, assetPathProblem, profileDefaults, profileIdentity, resolveProfileTheme, validateClubProfile, type ClubProfile } from '../lib/club-profile'

const example = JSON.parse(readFileSync(path.resolve(__dirname, '../clubs/example-fc/profile.json'), 'utf8'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = Record<string, any>
const clone = (): P => JSON.parse(JSON.stringify(example))
const errorsOf = (json: unknown, opts?: Parameters<typeof validateClubProfile>[1]) => {
  const r = validateClubProfile(json, opts)
  return r.ok ? [] : r.errors
}
const paths = (json: unknown, opts?: Parameters<typeof validateClubProfile>[1]) => errorsOf(json, opts).map((e) => e.path)

describe('validateClubProfile', () => {
  it('accepts the fictional example club', () => {
    const r = validateClubProfile(example, { statAsset: () => ({ size: 1000 }) })
    expect(r.ok).toBe(true)
  })

  it('passes the example without advisory notes', () => {
    const r = validateClubProfile(example)
    expect(r.ok && r.warnings).toEqual([])
  })

  it.each(['logo', 'ogImage', 'favicon'])('requires assets.%s so no club ships with another club\'s artwork', (k) => {
    const p = clone()
    delete p.assets[k]
    expect(paths(p)).toContain(`assets.${k}`)
  })

  it.each(['primary', 'surface', 'text', 'muted', 'headingFont'])('requires theme.%s (no colour is inherited from another club)', (k) => {
    const p = clone()
    delete p.theme[k]
    expect(paths(p)).toContain(`theme.${k}`)
  })

  it.each([
    ['copy.pages', { pages: 'oops' }],
    ['copy.pages.home.title', { pages: { home: { title: 5 } } }],
    ['copy.name', { name: 'Other FC' }],
    ['copy.siteUrl', { siteUrl: 'http://evil' }],
    ['copy.email', { email: 'x@evil.example' }],
    ['copy.address', { address: { locality: 'x' } }],
    ['copy.nope', { nope: 'x' }],
    ['copy.history.narrativ', { history: { narrativ: 'x' } }],
    ['copy.honourKeywords[0]', { honourKeywords: [3] }],
  ])('rejects bad copy at %s', (at, copy) => {
    const p = clone()
    p.copy = copy
    expect(paths(p)).toContain(at)
  })

  it('accepts well-formed copy overrides', () => {
    const p = clone()
    p.copy = { _comment: 'x', history: { pullQuote: 'We play on.' }, honourKeywords: ['rcca'], pages: { contact: { title: 'Contact us' } } }
    expect(validateClubProfile(p).ok).toBe(true)
  })

  it('ignores _comment keys', () => {
    expect(validateClubProfile(example).ok).toBe(true)
    expect(JSON.stringify(example)).toContain('_comment')
  })

  it.each([
    ['club.name', (p: P) => delete p.club.name],
    ['club.shortName', (p: P) => delete p.club.shortName],
    ['club.location', (p: P) => delete p.club.location],
    ['club.region', (p: P) => delete p.club.region],
    ['club.email', (p: P) => delete p.club.email],
    ['club.siteUrl', (p: P) => delete p.club.siteUrl],
    ['club.country', (p: P) => delete p.club.country],
    ['region.locale', (p: P) => delete p.region.locale],
    ['region.timezone', (p: P) => delete p.region.timezone],
    ['region.currency', (p: P) => delete p.region.currency],
    ['region.seasonStartMonth', (p: P) => delete p.region.seasonStartMonth],
    ['theme.accent', (p: P) => delete p.theme.accent],
    ['playhq.orgId', (p: P) => delete p.playhq.orgId],
    ['playhq.teamPrefix', (p: P) => delete p.playhq.teamPrefix],
    ['admin.email', (p: P) => delete p.admin.email],
    ['admin.name', (p: P) => delete p.admin.name],
  ])('requires %s', (field, mutate) => {
    const p = clone()
    mutate(p)
    expect(paths(p)).toContain(field)
  })

  it('rejects a bad hex colour', () => {
    const p = clone()
    p.theme.accent = 'orange'
    expect(paths(p)).toContain('theme.accent')
    p.theme.accent = '#F59E0'
    expect(paths(p)).toContain('theme.accent')
  })

  it('fails a palette that does not meet the contrast rules (an error, not a warning)', () => {
    const p = clone()
    p.theme.muted = '#C8D0CF' // pale grey on white is unreadable
    const errs = errorsOf(p)
    expect(errs.length).toBeGreaterThan(0)
    expect(errs.some((e) => /needs 4\.5 to 1/.test(e.message))).toBe(true)
  })

  it('derives the shades and keeps the derived deep accent readable', () => {
    const t = resolveProfileTheme({ accent: example.theme.accent, primary: example.theme.primary, surface: example.theme.surface, text: example.theme.text, muted: example.theme.muted, headingFont: example.theme.headingFont })
    expect(t.contrast.filter((c) => c.level === 'error' && !c.pass)).toEqual([])
    expect(t.shades.accentDeep).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('rejects an unknown heading font, a bad timezone, locale, currency and month', () => {
    const p = clone()
    p.theme.headingFont = 'comic-sans'
    p.region.timezone = 'Mars/Olympus'
    p.region.locale = 'not a locale!'
    p.region.currency = 'JPY'
    p.region.seasonStartMonth = 13
    expect(paths(p)).toEqual(expect.arrayContaining(['theme.headingFont', 'region.timezone', 'region.locale', 'region.currency', 'region.seasonStartMonth']))
  })

  it('requires an https site address with no path', () => {
    const p = clone()
    p.club.siteUrl = 'http://riverbend-cc.example'
    expect(paths(p)).toContain('club.siteUrl')
    p.club.siteUrl = 'https://riverbend-cc.example/home'
    expect(paths(p)).toContain('club.siteUrl')
    p.club.siteUrl = 'https://riverbend-cc.example/'
    expect(validateClubProfile(p).ok).toBe(true)
  })

  it('rejects any key named password, at any depth', () => {
    for (const mutate of [(p: P) => (p.admin.password = 'x'), (p: P) => (p.password = 'x'), (p: P) => (p.copy = { nested: { Password: 'x' } })]) {
      const p = clone()
      mutate(p)
      const errs = errorsOf(p)
      expect(errs.some((e) => /password/i.test(e.path))).toBe(true)
    }
  })

  it('rejects asset paths that escape the club folder', () => {
    for (const bad of ['../secret.png', '/etc/passwd.png', 'assets/../../x.png', 'C:\\x.png', 'https://evil.example/x.png', 'a\\b.png']) {
      const p = clone()
      p.assets.logo = bad
      expect(paths(p), bad).toContain('assets.logo')
    }
    expect(assetPathProblem('assets/crest.png')).toBeNull()
  })

  it('checks asset existence, type and size through statAsset', () => {
    const missing = errorsOf(example, { statAsset: () => null })
    expect(missing.map((e) => e.path)).toEqual(expect.arrayContaining(['assets.logo', 'assets.hero']))
    const big = errorsOf(example, { statAsset: () => ({ size: ASSET_MAX_BYTES.hero + 1 }) })
    expect(big.length).toBeGreaterThan(0)
    const p = clone()
    p.assets.logo = 'assets/crest.svg'
    expect(paths(p)).toContain('assets.logo')
    p.assets = { logo: 'assets/crest.png', banner: 'x.png' }
    expect(paths(p)).toContain('assets.banner')
  })

  it('rejects unsupported office keys and a non-object profile', () => {
    const p = clone()
    p.office.fees = [1]
    expect(paths(p)).toContain('office.fees')
    expect(errorsOf(null)).toHaveLength(1)
    expect(errorsOf([])).toHaveLength(1)
  })
})

describe('profile to defaults', () => {
  const ok = validateClubProfile(example)
  if (!ok.ok) throw new Error('example must be valid')
  const profile: ClubProfile = ok.profile

  it('builds the identity and full defaults from the profile', () => {
    const id = profileIdentity(profile)
    expect(id.location).toBe('Riverbend, Westland')
    expect(id.ogLocale).toBe('en_AU')
    expect(id.address.countryName).toBe('Australia')
    const d = profileDefaults(profile)
    expect(d.name).toBe('Riverbend Cricket Club')
    expect(d.tagline).toBe('Riverbend, Westland')
    expect(d.teamNamePrefix).toBe('Riverbend')
    expect(d.home.hero.headlineAccent).toContain('Riverbend')
    expect(d.navigation.copyrightName).toBe('Riverbend Cricket Club')
  })

  it('applies the supportedBy line and copy overrides', () => {
    const d = profileDefaults({ ...profile, club: { ...profile.club, supportedBy: 'Riverbend Shire' }, copy: { home: { hero: { headline: 'Bowl at Riverbend' } } } })
    expect(d.navigation.fundingCredit).toBe('Proudly supported by Riverbend Shire.')
    expect(d.home.hero.headline).toBe('Bowl at Riverbend')
    expect(d.home.hero.intro.length).toBeGreaterThan(10)
  })
})
