import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADMIN_TOKEN_NAMES, adminContrastChecks, adminTokenVars, deriveAdminTokens } from '../lib/theme/admin-tokens'
import { colorsFromForm, contrastRatio } from '../lib/theme/contrast'
import { suggestShades } from '../lib/theme/derive'
import { resolveTheme } from '../lib/theme/resolve'
import { THEME_SAMPLE_BLUE } from '../payload/seed/theme-defaults'

const seed = resolveTheme(null).colors
const failing = (colors: typeof seed) => adminContrastChecks(deriveAdminTokens({ colors })).filter((c) => !c.pass).map((c) => `${c.id} ${c.ratio.toFixed(2)}<${c.min}`)

const template = JSON.parse(readFileSync(path.resolve(__dirname, '../clubs/example-fc/profile.json'), 'utf8')).theme as Record<string, string>
const templateColors = colorsFromForm(
  { palette: { primary: template.primary, accent: template.accent, surface: template.surface, text: template.text, muted: template.muted }, shades: suggestShades(template.accent, template.primary, template.surface)! },
  seed,
)

describe('admin tokens meet their contrast requirements', () => {
  it('the seed theme passes every required pair after derivation', () => {
    expect(failing(seed)).toEqual([])
  })
  it('the neutral template theme passes', () => {
    expect(failing(templateColors)).toEqual([])
  })
  it('the sample blue theme passes', () => {
    expect(failing(colorsFromForm(THEME_SAMPLE_BLUE, seed))).toEqual([])
  })
  it('the seed needs no clamping except the focus ring, whose gold is too light on white', () => {
    expect(deriveAdminTokens({ colors: seed }).clamped).toEqual(['focus'])
  })
  it('a weak palette (pale grey muted text, near-white accent) is clamped to passing values', () => {
    const weak = { ...seed, grey: '#B8B8BE', 'gold-deep': '#E8D890', gold: '#FFF6B0', 'gold-pale': '#FFFBE0' }
    const tokens = deriveAdminTokens({ colors: weak })
    expect(tokens.clamped).toEqual(expect.arrayContaining(['muted', 'accent-ink', 'focus']))
    expect(adminContrastChecks(tokens).filter((c) => !c.pass)).toEqual([])
    expect(contrastRatio(tokens.hex.muted, tokens.hex.surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('the label on the accent fill is black or white, whichever reads better', () => {
    const dark = deriveAdminTokens({ colors: { ...seed, gold: '#1E3A8A' } })
    expect(dark.hex['on-accent']).toBe('#ffffff')
    expect(deriveAdminTokens({ colors: seed }).hex['on-accent']).toBe(seed.black)
  })
})

describe('adminTokenVars', () => {
  it('emits one R G B triple per token and nothing else', () => {
    const vars = adminTokenVars(deriveAdminTokens({ colors: seed }))
    expect(Object.keys(vars).sort()).toEqual(ADMIN_TOKEN_NAMES.map((n) => `--admin-${n}`).sort())
    for (const v of Object.values(vars)) expect(v).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
  })
})

describe('the admin stylesheets', () => {
  const css = ['payload/components/admin-theme.css', 'payload/components/admin.css', 'payload/components/ui/kit.css', 'payload/components/ui/shell.css'].map((f) => readFileSync(path.resolve(__dirname, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
  it('name no colour literal (hex); the tokens are variables from the theme', () => {
    for (const text of css) expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
