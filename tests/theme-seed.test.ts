import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkTheme } from '../lib/theme/contrast'
import { resolveTheme } from '../lib/theme/resolve'
import { BRAND_KEYS } from '../lib/theme/tokens'
import { THEME_SAMPLE_BLUE } from '../payload/seed/theme-defaults'
import { colorsFromForm } from '../lib/theme/contrast'

const root = path.resolve(__dirname, '..')

/** Frozen copy of the twelve brand values from before the theme system (config/brand.ts). Never edit to follow a re-colour. */
const LANG_LANG_2026 = {
  black: '#0B0B0D',
  ink: '#17171A',
  charcoal: '#26262B',
  gold: '#F5B700',
  'gold-dark': '#C99400',
  'gold-light': '#FFD966',
  'gold-pale': '#FFF4CC',
  'gold-deep': '#8A6500',
  cream: '#FAF7EF',
  stone: '#F3F1EA',
  grey: '#5A5A62',
  'grey-light': '#6E6E76',
}

describe('theme seed equals the previous hard-coded values', () => {
  it('resolveTheme(null).colors deep-equals the frozen literal', () => {
    expect(resolveTheme(null).colors).toEqual(LANG_LANG_2026)
  })

  it('DESIGN.md front matter lists the same twelve values', () => {
    const md = readFileSync(path.join(root, 'DESIGN.md'), 'utf8')
    const front = md.split(/\n---\n/)[0]
    const found: Record<string, string> = {}
    for (const m of front.matchAll(/^\s+brand-([a-z-]+):\s+"(#[0-9A-Fa-f]{6})"/gm)) found[m[1]] = m[2].toUpperCase()
    expect(found).toEqual(LANG_LANG_2026)
  })

  it('has zero contrast errors (warnings are known: DESIGN.md 13.4)', () => {
    const errors = checkTheme(resolveTheme(null).colors).filter((r) => r.level === 'error' && !r.pass)
    expect(errors).toEqual([])
  })

  it('the blue sample palette also has zero contrast errors', () => {
    const colors = colorsFromForm(THEME_SAMPLE_BLUE, resolveTheme(null).colors)
    expect(checkTheme(colors).filter((r) => r.level === 'error' && !r.pass)).toEqual([])
  })

  it('covers every brand key', () => {
    expect(Object.keys(LANG_LANG_2026).sort()).toEqual([...BRAND_KEYS].sort())
  })

  it('the theme migration is club-neutral: no hex DEFAULT in its SQL', () => {
    const dir = path.join(root, 'payload', 'migrations')
    const files = readdirSync(dir).filter((f) => /theme/.test(f) && f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(readFileSync(path.join(dir, f), 'utf8')).not.toMatch(/DEFAULT\s+'#[0-9a-fA-F]{3,8}'/i)
  })
})
