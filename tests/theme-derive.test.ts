import { describe, expect, it } from 'vitest'
import { checkTheme, colorsFromForm, contrastRatio } from '../lib/theme/contrast'
import { mixHex, suggestShades } from '../lib/theme/derive'
import { resolveTheme } from '../lib/theme/resolve'

describe('suggestShades', () => {
  it('mixes toward white and black', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080')
  })
  it('returns null for an invalid colour', () => {
    expect(suggestShades('nope', '#000000', '#FFFFFF')).toBeNull()
  })
  it('gives a deep accent that reads on white and on the pale tint, for several accents', () => {
    for (const accent of ['#F5B700', '#1E6FD9', '#D32F2F', '#2E9E5B', '#FFE600']) {
      const s = suggestShades(accent, '#0B0B0D', '#FAF7EF')!
      expect(contrastRatio(s.accentDeep!, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(s.accentDeep!, s.accentPale!)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('a blue accent with suggested shades passes every error pair', () => {
    const seed = resolveTheme(null).colors
    const shades = suggestShades('#5AA2FF', '#0B1B3A', '#F4F7FC')!
    const colors = colorsFromForm({ palette: { accent: '#5AA2FF', primary: '#0B1B3A', surface: '#F4F7FC' }, shades }, seed)
    const dark = checkTheme(colors).filter((r) => r.level === 'error' && !r.pass)
    expect(dark.map((r) => r.id)).toEqual([])
  })
})
