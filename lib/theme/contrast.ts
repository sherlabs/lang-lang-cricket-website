import { PALETTE_FIELDS, SHADE_FIELDS, normalizeHex, type BrandKey } from './tokens'

/** Neutral white, not a theme value (cards and dark-surface text are always white). */
const WHITE = '#FFFFFF'

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of `#RRGGBB`. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export type ContrastLevel = 'error' | 'warn'
export type ContrastResult = {
  id: string
  /** Plain-English description, e.g. "Body text on the page background". */
  label: string
  ratio: number
  min: number
  level: ContrastLevel
  pass: boolean
  /** Form field paths to flag (`palette.text`, `shades.accentDeep`). */
  fields: string[]
}

type Spec = { id: string; label: string; fg: BrandKey | 'white'; bg: BrandKey | 'white'; min: number; level: ContrastLevel; fields: string[] }

const SPECS: Spec[] = [
  { id: 'text-white', label: 'Body text on white', fg: 'charcoal', bg: 'white', min: 4.5, level: 'error', fields: ['palette.text'] },
  { id: 'text-surface', label: 'Body text on the light section band', fg: 'charcoal', bg: 'cream', min: 4.5, level: 'error', fields: ['palette.text', 'palette.surface'] },
  { id: 'muted-white', label: 'Secondary text on white', fg: 'grey', bg: 'white', min: 4.5, level: 'error', fields: ['palette.muted'] },
  { id: 'muted-surface', label: 'Secondary text on the light section band', fg: 'grey', bg: 'cream', min: 4.5, level: 'error', fields: ['palette.muted', 'palette.surface'] },
  { id: 'deep-white', label: 'Small accent text on white', fg: 'gold-deep', bg: 'white', min: 4.5, level: 'error', fields: ['shades.accentDeep'] },
  { id: 'deep-pale', label: 'Small accent text on the pale accent tint', fg: 'gold-deep', bg: 'gold-pale', min: 4.5, level: 'error', fields: ['shades.accentDeep', 'shades.accentPale'] },
  { id: 'button-label', label: 'Dark button label text on the accent colour', fg: 'black', bg: 'gold', min: 4.5, level: 'error', fields: ['palette.primary', 'palette.accent'] },
  { id: 'white-primary', label: 'White text on the dark surface', fg: 'white', bg: 'black', min: 4.5, level: 'error', fields: ['palette.primary'] },
  { id: 'accent-primary', label: 'Accent colour text on the dark surface', fg: 'gold', bg: 'black', min: 4.5, level: 'error', fields: ['palette.accent', 'palette.primary'] },
  { id: 'accentlight-primary', label: 'Light accent text on the dark surface', fg: 'gold-light', bg: 'black', min: 4.5, level: 'error', fields: ['shades.accentLight', 'palette.primary'] },
  { id: 'muted-stone', label: 'Secondary text on card fills', fg: 'grey', bg: 'stone', min: 4.5, level: 'error', fields: ['palette.muted', 'shades.surfaceMuted'] },
  { id: 'text-stone', label: 'Body text on card fills', fg: 'charcoal', bg: 'stone', min: 4.5, level: 'error', fields: ['palette.text', 'shades.surfaceMuted'] },
  { id: 'text-pale', label: 'Body text on the pale accent tint', fg: 'charcoal', bg: 'gold-pale', min: 4.5, level: 'error', fields: ['palette.text', 'shades.accentPale'] },
  { id: 'deep-surface', label: 'Small accent text on the light section band', fg: 'gold-deep', bg: 'cream', min: 4.5, level: 'error', fields: ['shades.accentDeep', 'palette.surface'] },
  { id: 'deep-stone', label: 'Small accent text on card fills', fg: 'gold-deep', bg: 'stone', min: 4.5, level: 'error', fields: ['shades.accentDeep', 'shades.surfaceMuted'] },
  { id: 'white-ink', label: 'White text on the raised dark surface', fg: 'white', bg: 'ink', min: 4.5, level: 'error', fields: ['shades.ink'] },
  { id: 'accent-ink', label: 'Accent colour text on the raised dark surface', fg: 'gold', bg: 'ink', min: 4.5, level: 'error', fields: ['palette.accent', 'shades.ink'] },
  { id: 'accentlight-ink', label: 'Light accent text on the raised dark surface', fg: 'gold-light', bg: 'ink', min: 4.5, level: 'error', fields: ['shades.accentLight', 'shades.ink'] },
  { id: 'mutedlight-white', label: 'Captions on white', fg: 'grey-light', bg: 'white', min: 4.5, level: 'warn', fields: ['shades.mutedLight'] },
  { id: 'mutedlight-stone', label: 'Captions on card fills', fg: 'grey-light', bg: 'stone', min: 4.5, level: 'warn', fields: ['shades.mutedLight', 'shades.surfaceMuted'] },
  { id: 'accent-white', label: 'Accent colour against white (focus ring)', fg: 'gold', bg: 'white', min: 3, level: 'warn', fields: ['palette.accent'] },
]

/** Check every pair on the 12 resolved colours (`#RRGGBB` per brand key). */
export function checkTheme(colors: Record<BrandKey, string>): ContrastResult[] {
  const pick = (k: BrandKey | 'white') => (k === 'white' ? WHITE : colors[k])
  return SPECS.map((s) => {
    const ratio = contrastRatio(pick(s.fg), pick(s.bg))
    return { id: s.id, label: s.label, ratio, min: s.min, level: s.level, pass: ratio >= s.min, fields: s.fields }
  })
}

/** Resolved colours from a form-shaped `{ palette, shades }` value (admin report and the save hook). */
export function colorsFromForm(data: { palette?: Record<string, unknown>; shades?: Record<string, unknown> } | null | undefined, fallback: Record<BrandKey, string>): Record<BrandKey, string> {
  const out = { ...fallback }
  for (const [name, key] of Object.entries(PALETTE_FIELDS)) {
    out[key] = normalizeHex(data?.palette?.[name]) ?? out[key]
  }
  for (const [name, key] of Object.entries(SHADE_FIELDS)) {
    out[key] = normalizeHex(data?.shades?.[name]) ?? out[key]
  }
  return out
}
