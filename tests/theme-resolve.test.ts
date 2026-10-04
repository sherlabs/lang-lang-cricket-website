import { describe, expect, it } from 'vitest'
import { themeCss, themeCssVars } from '../lib/theme/css'
import { themeReadFailureIsFatal } from '../lib/theme/read-failure'
import { resolveTheme } from '../lib/theme/resolve'
import { BRAND_KEYS, hexToChannels, normalizeHex } from '../lib/theme/tokens'
import { BRANDING } from '../config/site'

describe('normalizeHex / hexToChannels', () => {
  it('expands three digits and upper-cases', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC')
    expect(normalizeHex('#0b0b0d')).toBe('#0B0B0D')
  })
  it('rejects non-hex, wrong length and non-strings', () => {
    for (const v of ['', 'red', '#12345', '#1234567', '0B0B0D', '#GGGGGG', 12, null, undefined]) expect(normalizeHex(v)).toBeNull()
  })
  it('converts to channel triples', () => {
    expect(hexToChannels('#0B0B0D')).toBe('11 11 13')
    expect(hexToChannels('#FFFFFF')).toBe('255 255 255')
  })
})

describe('resolveTheme', () => {
  it('null gives the seed with the default font', () => {
    const t = resolveTheme(null)
    expect(t.colors.gold).toBe('#F5B700')
    expect(t.channels.black).toBe('11 11 13')
    expect(t.font.key).toBe('barlow-condensed')
    expect(t.font.family).toBe('Barlow Condensed')
  })
  it('saved values override the seed, field by field', () => {
    const t = resolveTheme({ palette: { accent: '#4b96f0' }, shades: { accentDeep: '#123456' }, headingFont: 'oswald' })
    expect(t.colors.gold).toBe('#4B96F0')
    expect(t.channels.gold).toBe('75 150 240')
    expect(t.colors['gold-deep']).toBe('#123456')
    expect(t.colors.black).toBe('#0B0B0D')
    expect(t.font.key).toBe('oswald')
  })
  it('an invalid stored hex or font falls back to the seed', () => {
    const t = resolveTheme({ palette: { accent: 'url(javascript:1)', primary: '' }, headingFont: 'comic-sans' })
    expect(t.colors.gold).toBe('#F5B700')
    expect(t.colors.black).toBe('#0B0B0D')
    expect(t.font.key).toBe('barlow-condensed')
  })
  it('tolerates junk docs', () => {
    for (const d of [undefined, 3, 'x', [], { palette: 4 }]) expect(resolveTheme(d).colors.gold).toBe('#F5B700')
  })
  it('crest chain: theme.crest, then legacy club logo, then the bundled crest', () => {
    expect(resolveTheme({ crest: { url: '/media/a.png' } }, { clubLogoUrl: '/media/legacy.png' }).crest.url).toBe('/media/a.png')
    expect(resolveTheme({ crest: null }, { clubLogoUrl: '/media/legacy.png' }).crest.url).toBe('/media/legacy.png')
    expect(resolveTheme({ crest: 5 }, { clubLogoUrl: '  ' }).crest.url).toBe(BRANDING.logo)
    expect(resolveTheme(null).crest.url).toBe(BRANDING.logo)
  })
})

describe('themeCss', () => {
  it('emits exactly the twelve variables as channel triples', () => {
    const css = themeCss(resolveTheme(null))
    expect(css.startsWith(':root{')).toBe(true)
    for (const k of BRAND_KEYS) expect(css).toMatch(new RegExp(`--brand-${k}:\\d{1,3} \\d{1,3} \\d{1,3}`))
    expect(css.match(/--brand-/g)).toHaveLength(12)
    expect(css).toContain('--brand-black:11 11 13')
  })
  it('cannot be injected through a stored value', () => {
    const css = themeCss(resolveTheme({ palette: { primary: '#000;}</style><script>x</script>' } }))
    expect(css).not.toMatch(/[<>"'\\]/)
    expect(css.split(';').length).toBe(12)
  })
  it('refuses a malformed channel triple', () => {
    expect(() => themeCss({ channels: { ...resolveTheme(null).channels, black: '1;}x' } })).toThrow()
  })
})

describe('themeReadFailureIsFatal', () => {
  it('is fatal on Vercel production only', () => {
    expect(themeReadFailureIsFatal({ VERCEL_ENV: 'production' })).toBe(true)
    for (const e of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, { NODE_ENV: 'production' }]) {
      expect(themeReadFailureIsFatal(e)).toBe(false)
    }
  })
})

describe('resolveTheme version', () => {
  it('is empty for the seed and changes with the theme or crest updatedAt', () => {
    expect(resolveTheme(null).version).toBe('')
    const a = resolveTheme({ updatedAt: '2026-01-01', crest: { url: '/a.png', updatedAt: '2026-01-02' } }).version
    const b = resolveTheme({ updatedAt: '2026-01-01', crest: { url: '/a.png', updatedAt: '2026-01-03' } }).version
    expect(a).not.toBe(b)
  })
})

describe('themeCssVars', () => {
  it('carries the same twelve variables as themeCss', () => {
    const theme = resolveTheme(null)
    const vars = themeCssVars(theme)
    expect(Object.keys(vars)).toHaveLength(BRAND_KEYS.length)
    expect(themeCss(theme)).toBe(`:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`)
  })
})
