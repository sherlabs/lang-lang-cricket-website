import { contrastRatio } from '@/lib/theme/contrast'
import { BLACK, WHITE } from '@/lib/theme/neutral'
import type { ResolvedTheme } from '@/lib/theme/resolve'
import type { StyleKey } from './types'

/**
 * Theme-driven, contrast-checked colours for the social graphics (wave C spec 3.2). Every colour is a theme token, a neutral white or
 * black, or a mix of those; text colours are never chosen by hand, they are picked for the background they sit on. The guarantee is
 * for solid backgrounds (white and black together always reach 4.58:1 on one of them). Text over a photo goes on a scrim (below).
 */
export const MIN_CONTRAST = 4.5

type Rgb = [number, number, number]
const toRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
}
const toHex = ([r, g, b]: Rgb): string => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`

/** `a` moved `t` (0 to 1) of the way toward `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const [x, y] = [toRgb(a), toRgb(b)]
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb)
}

/** `overlay` at `alpha` drawn over `base`: the colour you see. */
export const composite = (base: string, overlay: string, alpha: number): string => mixHex(base, overlay, alpha)

/** CSS `rgba()` of a hex colour, for translucent fills (satori understands it). */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** The first candidate reaching `min` against every background, or null. */
function firstReadable(bgs: readonly string[], candidates: readonly string[], min = MIN_CONTRAST): string | null {
  return candidates.find((c) => bgs.every((bg) => contrastRatio(c, bg) >= min)) ?? null
}

/** The most readable of white, black and the theme's two darkest tokens on one solid background. */
export function readableOn(bg: string, theme: Pick<ResolvedTheme, 'colors'>): string {
  const candidates = [WHITE, BLACK, theme.colors.black, theme.colors.charcoal]
  return candidates.reduce((best, c) => (contrastRatio(c, bg) > contrastRatio(best, bg) ? c : best), candidates[0])
}

/** `text` softened toward the background, kept only if it still reads on every background; otherwise `text` itself. */
export function mutedOn(bgs: readonly string[], text: string): string {
  const mix = mixHex(text, bgs[0], 0.25)
  return firstReadable(bgs, [mix]) ?? text
}

/** The accent shades that read as text on every background, else the plain readable text colour. */
export function accentText(bgs: readonly string[], theme: Pick<ResolvedTheme, 'colors'>, text: string): string {
  const c = theme.colors
  return firstReadable(bgs, [c['gold-light'], c.gold, c['gold-deep'], c['gold-dark']]) ?? text
}

export type Scrim = { color: string; alpha: number; /** The text colour that reads on the scrim over any photo. */ text: string }

/**
 * A scrim for text near a photo. The photo is unknown, so the worst cases are computed: the scrim colour is composited over pure
 * white and pure black and the text must reach 4.5:1 on both. If no alpha manages it, the scrim becomes solid.
 */
export function scrimFor(color: string, theme: Pick<ResolvedTheme, 'colors'>): Scrim {
  const candidates = [WHITE, BLACK, theme.colors.black, theme.colors.charcoal, theme.colors.cream]
  // White and black are the extremes; a few greys in between cover a text colour whose own luminance falls inside the range.
  const photos = [WHITE, mixHex(WHITE, BLACK, 0.25), mixHex(WHITE, BLACK, 0.5), mixHex(WHITE, BLACK, 0.75), BLACK]
  for (const alpha of [0.8, 0.9, 0.95]) {
    const text = firstReadable(photos.map((p) => composite(p, color, alpha)), candidates)
    if (text) return { color, alpha, text }
  }
  return { color, alpha: 1, text: readableOn(color, theme) }
}

export type StyleTokens = {
  surface: string
  /** A slightly different panel colour, verified to carry the same text. Equals `surface` when no tint reads. */
  surfaceAlt: string
  text: string
  textMuted: string
  /** Accent as text. */
  accentText: string
  /** Accent as a fill (bars, rules, badges), with the text that sits on it. */
  accent: string
  onAccent: string
  rule: string
  /** The coloured band that carries the crest in the classic style (the surface for the others). */
  band: string
  bandText: string
  scrim: Scrim
}

/** The colours of one style from one theme. Pure: a different palette gives different tokens. */
export function styleTokens(theme: Pick<ResolvedTheme, 'colors'>, style: StyleKey): StyleTokens {
  const c = theme.colors
  const surface = style === 'bold' ? c.black : style === 'classic' ? c.cream : WHITE
  const text = readableOn(surface, theme)
  const tint = mixHex(surface, text, 0.07)
  const surfaceAlt = contrastRatio(text, tint) >= MIN_CONTRAST ? tint : surface
  const both = [surface, surfaceAlt]
  const band = c.black
  return {
    surface,
    surfaceAlt,
    text,
    textMuted: mutedOn(both, text),
    accentText: accentText(both, theme, text),
    accent: c.gold,
    onAccent: readableOn(c.gold, theme),
    rule: c.gold,
    band,
    bandText: readableOn(band, theme),
    scrim: scrimFor(style === 'bold' ? c.black : style === 'classic' ? c.cream : c.charcoal, theme),
  }
}
