import { describe, expect, it } from 'vitest'
import { composite, mixHex, mutedOn, readableOn, scrimFor, styleTokens, MIN_CONTRAST } from '@/lib/social/style'
import { STYLE_KEYS } from '@/lib/social/types'
import { contrastRatio } from '@/lib/theme/contrast'
import { BLACK, WHITE } from '@/lib/theme/neutral'
import { resolveTheme } from '@/lib/theme/resolve'
import { BRAND_KEYS, type BrandKey } from '@/lib/theme/tokens'
import { resolveSocialSettings } from '@/lib/social/settings'

const seed = resolveTheme(null).colors
const paint = (over: Partial<Record<BrandKey, string>>): { colors: Record<BrandKey, string> } => ({ colors: { ...seed, ...over } })
const all = (hex: string) => paint(Object.fromEntries(BRAND_KEYS.map((k) => [k, hex])) as Record<BrandKey, string>)

/** Ten palettes, including the awkward ones: everything the same, mid-grey, near-white, near-black and saturated. */
const PALETTES: [string, { colors: Record<BrandKey, string> }][] = [
  ['seed', { colors: seed }],
  ['dark', paint({ black: '#101820', charcoal: '#222831', cream: '#1b1b1b', stone: '#2a2a2a', gold: '#f2aa4c' })],
  ['light', paint({ black: '#f5f5f5', charcoal: '#fafafa', cream: '#ffffff', stone: '#eeeeee', gold: '#ffe066' })],
  ['mid-grey', all('#808080')],
  ['all-same', all('#336699')],
  ['near-white', all('#fefefe')],
  ['near-black', all('#010101')],
  ['saturated-red', paint({ black: '#ff0000', cream: '#ff3333', gold: '#00ff00', charcoal: '#cc0000' })],
  ['saturated-blue', paint({ black: '#0000ff', cream: '#3366ff', gold: '#ffff00', charcoal: '#0000cc' })],
  ['mid-contrast', paint({ black: '#777777', cream: '#999999', charcoal: '#666666', gold: '#888888' })],
]

describe('social style tokens', () => {
  it('readableOn reaches 4.5 on every solid background (white and black together always reach 4.58)', () => {
    for (const [, theme] of PALETTES) {
      for (let v = 0; v <= 255; v += 5) {
        const bg = `#${[v, v, v].map((n) => n.toString(16).padStart(2, '0')).join('')}`
        expect(contrastRatio(readableOn(bg, theme), bg), bg).toBeGreaterThanOrEqual(4.58 - 0.01)
      }
    }
  })

  it('every text and background pair of every style is at least 4.5:1, for every palette', () => {
    for (const [name, theme] of PALETTES) {
      for (const style of STYLE_KEYS) {
        const t = styleTokens(theme, style)
        for (const bg of [t.surface, t.surfaceAlt]) {
          for (const fg of [t.text, t.textMuted, t.accentText]) expect(contrastRatio(fg, bg), `${name} ${style} ${fg} on ${bg}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
        }
        expect(contrastRatio(t.bandText, t.band), `${name} ${style} band`).toBeGreaterThanOrEqual(MIN_CONTRAST)
        expect(contrastRatio(t.onAccent, t.accent), `${name} ${style} accent`).toBeGreaterThanOrEqual(MIN_CONTRAST)
      }
    }
  })

  it('the scrim text reads over the worst-case photo (white, black and greys between), not just over the surface colour', () => {
    for (const [name, theme] of PALETTES) {
      for (const style of STYLE_KEYS) {
        const { scrim } = styleTokens(theme, style)
        expect(scrim.alpha).toBeGreaterThan(0)
        for (const photo of [WHITE, BLACK, mixHex(WHITE, BLACK, 0.5), mixHex(WHITE, BLACK, 0.25), mixHex(WHITE, BLACK, 0.75)]) {
          expect(contrastRatio(scrim.text, composite(photo, scrim.color, scrim.alpha)), `${name} ${style} over ${photo}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
        }
      }
    }
  })

  it('a mid-grey scrim colour still gives readable text over any photo (it is made more opaque until it does)', () => {
    const grey = paint({ black: '#808080', charcoal: '#808080', cream: '#808080' })
    const s = scrimFor('#808080', grey)
    expect(s.alpha).toBeGreaterThanOrEqual(0.8)
    for (const photo of [WHITE, BLACK]) expect(contrastRatio(s.text, composite(photo, '#808080', s.alpha))).toBeGreaterThanOrEqual(4.5)
  })

  it('muted text is derived and falls back to the plain text colour when the soft mix would not read', () => {
    expect(mutedOn(['#808080'], WHITE)).toBe(WHITE)
    const soft = mutedOn([WHITE], BLACK)
    expect(contrastRatio(soft, WHITE)).toBeGreaterThanOrEqual(4.5)
    expect(soft).not.toBe(BLACK)
  })

  it('a different palette gives different tokens (another club looks different)', () => {
    const a = styleTokens(PALETTES[0][1], 'bold')
    const b = styleTokens(PALETTES[7][1], 'bold')
    expect(a.surface).not.toBe(b.surface)
    expect(a.accent).not.toBe(b.accent)
  })

  it('the three styles differ for one theme', () => {
    const surfaces = new Set(STYLE_KEYS.map((s) => styleTokens(PALETTES[0][1], s).surface))
    expect(surfaces.size).toBe(3)
  })

  it('uses the club default style from the settings, and falls back when it is unknown', () => {
    expect(resolveSocialSettings({ defaultStyle: 'classic' }).defaultStyle).toBe('classic')
    expect(resolveSocialSettings({ defaultStyle: 'neon' }).defaultStyle).toBe('bold')
    expect(resolveSocialSettings(null).defaultStyle).toBe('bold')
  })
})
