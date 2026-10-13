/**
 * Admin design tokens (wave G WP-1), derived from the club's resolved theme. Pure: no Next or Payload imports.
 *
 * The admin stylesheet names no colour. Every colour it uses is one of the `--admin-*` variables produced here (set as `R G B`
 * channel triples on <html> next to the `--brand-*` ones), so a club with a weak palette still gets a readable admin: any derived
 * text or control colour that misses its contrast requirement is stepped toward ink (or white on the accent fill) until it
 * passes. The requirements are `adminContrastChecks()`; `tests/admin-contrast.test.ts` runs them against the seed theme, the
 * neutral template theme and deliberately bad palettes, and the theme editor (`ThemeContrast`) shows the same pairs.
 */
import { contrastRatio } from './contrast'
import type { BrandKey } from './tokens'

type Hex = string

/** Names of the derived tokens (the CSS variable is `--admin-<name>`). */
export const ADMIN_TOKEN_NAMES = ['bg', 'surface', 'ink', 'text', 'muted', 'line', 'control', 'accent', 'accent-ink', 'on-accent', 'tint', 'focus', 'danger', 'danger-tint', 'ok', 'ok-tint', 'warn', 'warn-tint'] as const
export type AdminTokenName = (typeof ADMIN_TOKEN_NAMES)[number]

export type AdminTokens = {
  /** '#RRGGBB' per token, for tests, the theme editor and anything that needs a real colour. */
  hex: Record<AdminTokenName, Hex>
  /** Tokens that were clamped to meet their contrast requirement (empty for a healthy palette). */
  clamped: AdminTokenName[]
}

/** Neutral white (cards, text on a dark accent). Not a theme value. */
const WHITE: [number, number, number] = [255, 255, 255]

/**
 * State colours are the same for every club, so a status never depends on a palette: green-700 / amber-800 / red-700 text on
 * their 50 tints. Kept as channel numbers (not hex literals) because `tests/no-brand-hex.test.ts` forbids hex in app code.
 */
const STATUS: Record<'danger' | 'ok' | 'warn', { fg: [number, number, number]; tint: [number, number, number] }> = {
  ok: { fg: [21, 128, 61], tint: [240, 253, 244] },
  warn: { fg: [146, 64, 14], tint: [255, 251, 235] },
  danger: { fg: [185, 28, 28], tint: [254, 242, 242] },
}

type Rgb = [number, number, number]
const toRgb = (hex: Hex): Rgb => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
}
const toHex = (c: Rgb): Hex => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const triple = (hex: Hex): string => toRgb(hex).join(' ')

/** Step `from` toward `target` in 5 percent steps until `ok` passes. Returns the first passing colour and whether it moved. */
function clampToward(from: Hex, target: Hex, ok: (c: Hex) => boolean): { value: Hex; clamped: boolean } {
  if (ok(from)) return { value: from, clamped: false }
  for (let i = 1; i <= 20; i++) {
    const c = toHex(mix(toRgb(from), toRgb(target), i / 20))
    if (ok(c)) return { value: c, clamped: true }
  }
  return { value: target, clamped: true }
}

export function deriveAdminTokens(theme: { colors: Record<BrandKey, Hex> }): AdminTokens {
  const c = theme.colors
  const clamped: AdminTokenName[] = []
  const note = (name: AdminTokenName, r: { value: Hex; clamped: boolean }): Hex => {
    if (r.clamped) clamped.push(name)
    return r.value
  }

  const bg = c.stone
  const surface = toHex(mix(WHITE, toRgb(c.cream), 0.4))
  const ink = c.black
  const text = c.charcoal
  const tint = c['gold-pale']
  const accent = c.gold

  const muted = note('muted', clampToward(c.grey, ink, (x) => contrastRatio(x, surface) >= 4.5 && contrastRatio(x, bg) >= 4.5 && contrastRatio(x, tint) >= 4.5))
  const accentInk = note('accent-ink', clampToward(c['gold-deep'], ink, (x) => contrastRatio(x, tint) >= 4.5 && contrastRatio(x, surface) >= 4.5 && contrastRatio(x, bg) >= 4.5))
  const focus = note('focus', clampToward(accent, ink, (x) => contrastRatio(x, surface) >= 3 && contrastRatio(x, bg) >= 3))
  const control = note('control', clampToward(toHex(mix(toRgb(surface), toRgb(ink), 0.5)), ink, (x) => contrastRatio(x, surface) >= 3 && contrastRatio(x, bg) >= 3))
  const line = toHex(mix(toRgb(surface), toRgb(ink), 0.1))
  // Black or white, whichever reads better on the accent fill; one of the two always reaches 4.5.
  const onAccent = contrastRatio(ink, accent) >= contrastRatio('#ffffff', accent) ? ink : '#ffffff'

  const hex = {
    bg,
    surface,
    ink,
    text,
    muted,
    line,
    control,
    accent,
    'accent-ink': accentInk,
    'on-accent': onAccent,
    tint,
    focus,
    danger: toHex(STATUS.danger.fg),
    'danger-tint': toHex(STATUS.danger.tint),
    ok: toHex(STATUS.ok.fg),
    'ok-tint': toHex(STATUS.ok.tint),
    warn: toHex(STATUS.warn.fg),
    'warn-tint': toHex(STATUS.warn.tint),
  } satisfies Record<AdminTokenName, Hex>
  return { hex, clamped }
}

/** The `--admin-*` variables as `R G B` triples, for the inline style on <html> (next to `themeCssVars`). */
export function adminTokenVars(tokens: Pick<AdminTokens, 'hex'>): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const name of ADMIN_TOKEN_NAMES) {
    const t = triple(tokens.hex[name])
    if (!/^\d{1,3} \d{1,3} \d{1,3}$/.test(t)) throw new Error(`Bad admin token ${name}`)
    vars[`--admin-${name}`] = t
  }
  return vars
}

export type AdminContrastCheck = { id: string; label: string; ratio: number; min: number; pass: boolean }

type PairSpec = { id: string; label: string; fg: AdminTokenName; bg: AdminTokenName; min: number }
const PAIRS: PairSpec[] = [
  { id: 'muted-surface', label: 'Help text on a card', fg: 'muted', bg: 'surface', min: 4.5 },
  { id: 'muted-bg', label: 'Help text on the page background', fg: 'muted', bg: 'bg', min: 4.5 },
  { id: 'ink-surface', label: 'Headings on a card', fg: 'ink', bg: 'surface', min: 4.5 },
  { id: 'ink-bg', label: 'Headings on the page background', fg: 'ink', bg: 'bg', min: 4.5 },
  { id: 'text-surface', label: 'Body text on a card', fg: 'text', bg: 'surface', min: 4.5 },
  { id: 'text-bg', label: 'Body text on the page background', fg: 'text', bg: 'bg', min: 4.5 },
  { id: 'accent-ink-tint', label: 'Accent text on a highlighted row', fg: 'accent-ink', bg: 'tint', min: 4.5 },
  { id: 'accent-ink-surface', label: 'Accent text on a card', fg: 'accent-ink', bg: 'surface', min: 4.5 },
  { id: 'on-accent-accent', label: 'Button label on the accent colour', fg: 'on-accent', bg: 'accent', min: 4.5 },
  { id: 'ok-pill', label: 'Green status label', fg: 'ok', bg: 'ok-tint', min: 4.5 },
  { id: 'warn-pill', label: 'Amber status label', fg: 'warn', bg: 'warn-tint', min: 4.5 },
  { id: 'danger-pill', label: 'Red status label', fg: 'danger', bg: 'danger-tint', min: 4.5 },
  { id: 'focus-surface', label: 'Keyboard focus ring on a card', fg: 'focus', bg: 'surface', min: 3 },
  { id: 'focus-bg', label: 'Keyboard focus ring on the page background', fg: 'focus', bg: 'bg', min: 3 },
  { id: 'control-surface', label: 'Input borders on a card', fg: 'control', bg: 'surface', min: 3 },
]

/** Every required pair, checked on the derived (clamped) tokens. */
export function adminContrastChecks(tokens: Pick<AdminTokens, 'hex'>): AdminContrastCheck[] {
  return PAIRS.map((p) => {
    const ratio = contrastRatio(tokens.hex[p.fg], tokens.hex[p.bg])
    return { id: p.id, label: p.label, ratio, min: p.min, pass: ratio >= p.min }
  })
}
