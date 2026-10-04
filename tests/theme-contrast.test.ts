import { describe, expect, it } from 'vitest'
import { checkTheme, colorsFromForm, contrastRatio, relativeLuminance } from '../lib/theme/contrast'
import { resolveTheme } from '../lib/theme/resolve'

describe('contrast maths', () => {
  it('black on white is 21 and white on white is 1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })
  it('is symmetric and luminance spans 0 to 1', () => {
    expect(contrastRatio('#F5B700', '#0B0B0D')).toBeCloseTo(contrastRatio('#0B0B0D', '#F5B700'), 8)
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 8)
  })
  it('matches the DESIGN.md figures for gold-deep (5.33 on white, 4.84 on gold-pale)', () => {
    expect(contrastRatio('#8A6500', '#FFFFFF')).toBeCloseTo(5.33, 1)
    expect(contrastRatio('#8A6500', '#FFF4CC')).toBeCloseTo(4.84, 1)
  })
})

describe('checkTheme', () => {
  const seed = resolveTheme(null).colors
  it('seed: every error pair passes; the known warnings fail', () => {
    const r = checkTheme(seed)
    expect(r.filter((x) => x.level === 'error' && !x.pass)).toEqual([])
    const warn = r.filter((x) => !x.pass).map((x) => x.id).sort()
    expect(warn).toEqual(['accent-white', 'mutedlight-stone'])
    expect(r.find((x) => x.id === 'mutedlight-stone')!.ratio).toBeCloseTo(4.47, 1)
  })
  it('flags a pale body text colour as an error on the offending field', () => {
    const bad = colorsFromForm({ palette: { text: '#CCCCCC' } }, seed)
    const fails = checkTheme(bad).filter((x) => x.level === 'error' && !x.pass)
    expect(fails.map((x) => x.id)).toContain('text-white')
    expect(fails.find((x) => x.id === 'text-white')!.fields).toContain('palette.text')
  })
  it('ignores invalid hex in the form value (falls back to the base)', () => {
    expect(colorsFromForm({ palette: { text: 'nope' } }, seed).charcoal).toBe(seed.charcoal)
  })
})
