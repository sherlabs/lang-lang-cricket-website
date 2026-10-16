import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultsForClub } from '../lib/club-merge'
import { validateClubProfile } from '../lib/club-profile'
import { buildClubDefaults, TEMPLATE_IDENTITY, clubDefaultsFor, resolveClubPreset } from '../payload/seed/club-defaults'
import { LANG_LANG_IDENTITY, langLangDefaults } from '../payload/seed/presets/lang-lang'

const root = path.resolve(__dirname, '..')
/** Every token that identifies the Lang Lang preset. */
const PRESET_TOKENS = /lang ?lang|caldermeade|cardinia|ccca|llcc|victoria|melbourne|gippsland|westernport|community bank|bendigo|langlangcricketclub/i
const FICTIONAL = buildClubDefaults({
  name: 'Riverbend Cricket Club',
  shortName: 'Riverbend CC',
  familiarName: 'Riverbend',
  location: 'Riverbend, Westland',
  siteUrl: 'https://riverbend-cc.example',
  locale: 'en-AU',
  ogLocale: 'en_AU',
  email: 'info@riverbend-cc.example',
  address: { locality: 'Riverbend', region: 'Westland', regionName: 'Westland', country: 'AU', countryName: 'Australia' },
  teamNamePrefix: 'Riverbend',
})

/** Every string in a value, depth first. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
  return out
}

describe('neutral club defaults', () => {
  it('the builder output for a fictional club holds none of the preset tokens', () => {
    const hits = strings(FICTIONAL).filter((s) => PRESET_TOKENS.test(s))
    expect(hits).toEqual([])
  })

  it('carries the club identity through the copy', () => {
    const text = strings(FICTIONAL).join('\n')
    expect(text).toContain('Riverbend Cricket Club')
    expect(FICTIONAL.home.hero.headlineAccent).toBe('with Riverbend')
    expect(FICTIONAL.defaultDescription).toContain('Riverbend, Westland')
  })

  it('the neutral template identity has no preset token either', () => {
    expect(strings(clubDefaultsFor('template')).filter((s) => PRESET_TOKENS.test(s))).toEqual([])
    expect(TEMPLATE_IDENTITY.name).toBe('Your Cricket Club')
  })

  it('the Lang Lang preset keeps its own words', () => {
    expect(langLangDefaults.name).toBe(LANG_LANG_IDENTITY.name)
    expect(langLangDefaults.associationLabel).toBe('CCCA Directory')
    expect(langLangDefaults.honourKeywords).toEqual(['ccca'])
    expect(langLangDefaults.pageCopy.documentCategories.map((c) => c.category)).toContain('Association directory')
  })

  it('has the same keys as the preset (the builder cannot drift from the shape)', () => {
    const shape = (v: unknown, p = ''): string[] =>
      v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).flatMap(([k, x]) => shape(x, `${p}.${k}`)) : [p]
    expect(shape(FICTIONAL).sort()).toEqual(shape(langLangDefaults).sort())
  })

  it('CLUB_PRESET picks the set: lang-lang in development and test, template elsewhere', () => {
    expect(resolveClubPreset({ NODE_ENV: 'test' })).toBe('lang-lang')
    expect(resolveClubPreset({ NODE_ENV: 'development' })).toBe('lang-lang')
    expect(resolveClubPreset({ NODE_ENV: 'production' })).toBe('template')
    expect(resolveClubPreset({ NODE_ENV: 'production', CLUB_PRESET: 'lang-lang' })).toBe('lang-lang')
    expect(resolveClubPreset({ NODE_ENV: 'test', CLUB_PRESET: 'template' })).toBe('template')
    expect(resolveClubPreset({ NODE_ENV: 'test', CLUB_PRESET: 'bogus' })).toBe('lang-lang')
  })
})

describe('defaults follow the saved identity', () => {
  const saved = { updatedAt: '2026-10-13T00:00:00.000Z', name: 'Riverbend Cricket Club', shortName: 'Riverbend CC', tagline: 'Riverbend, Westland', address: { locality: 'Riverbend' } }

  it('the template builds the non-editable copy from the saved club', () => {
    const d = defaultsForClub(saved, clubDefaultsFor('template'), 'template')
    expect(d.home.hero.headlineAccent).toBe('with Riverbend')
    expect(d.navigation.copyrightName).toBe('Riverbend Cricket Club')
    // The team prefix comes from env (the development default is Lang Lang's), so it is left out of this scan.
    expect(strings({ ...d, teamNamePrefix: '' }).filter((x) => PRESET_TOKENS.test(x))).toEqual([])
  })

  it('an unsaved club and the Lang Lang preset are left exactly as they are', () => {
    const tpl = clubDefaultsFor('template')
    expect(defaultsForClub(null, tpl, 'template')).toBe(tpl)
    expect(defaultsForClub({ ...saved, updatedAt: undefined }, tpl, 'template')).toBe(tpl)
    expect(defaultsForClub(saved, langLangDefaults, 'lang-lang')).toBe(langLangDefaults)
  })
})

describe('preset imports', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(path.join(root, dir))) {
      if (e === 'node_modules' || e === '.next') continue
      const rel = path.join(dir, e)
      if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out)
      else if (/\.(ts|tsx)$/.test(e)) out.push(rel)
    }
    return out
  }

  it('presets/lang-lang.ts is imported only by club-defaults, seeds, scripts and tests', () => {
    const importers = ['app', 'components', 'lib', 'payload', 'config', 'scripts', 'tests'].flatMap((d) => walk(d)).filter((f) => /presets\/lang-lang['"]/.test(readFileSync(path.join(root, f), 'utf8')))
    const allowed = (f: string) =>
      f === 'payload/seed/club-defaults.ts' || f.startsWith('payload/seed/') || f.startsWith('payload/scripts/') || f.startsWith('tests/') || f === 'scripts/check-template.ts'
    expect(importers.filter((f) => !allowed(f))).toEqual([])
    const outside = importers.filter((f) => ['app/', 'components/', 'lib/'].some((p) => f.startsWith(p)))
    expect(outside).toEqual([])
  })
})

describe('the example club profile', () => {
  const raw = readFileSync(path.join(root, 'clubs/example-fc/profile.json'), 'utf8')

  it('is valid and fictional', () => {
    expect(validateClubProfile(JSON.parse(raw)).ok).toBe(true)
    expect(raw).not.toMatch(PRESET_TOKENS)
  })

  it('uses only reserved .example domains', () => {
    const urls = [...raw.matchAll(/https?:\/\/[^"\s/]+/g)].map((m) => new URL(m[0]).hostname)
    const emails = [...raw.matchAll(/[\w.+-]+@([\w.-]+)/g)].map((m) => m[1])
    for (const h of [...urls, ...emails]) expect(h.endsWith('.example'), h).toBe(true)
  })

  it('uses the all-zero PlayHQ placeholder and no password', () => {
    expect(JSON.parse(raw).playhq.orgId).toBe('00000000-0000-0000-0000-000000000000')
    expect(raw).not.toMatch(/password/i)
  })
})
