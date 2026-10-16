/** Theme vocabulary shared by the CSS, Tailwind, admin and OG code. Pure: safe to import anywhere. */
export const BRAND_KEYS = [
  'black',
  'ink',
  'charcoal',
  'gold',
  'gold-dark',
  'gold-light',
  'gold-pale',
  'gold-deep',
  'cream',
  'stone',
  'grey',
  'grey-light',
] as const
export type BrandKey = (typeof BRAND_KEYS)[number]

export const FONT_KEYS = ['barlow-condensed', 'oswald', 'bebas-neue', 'anton', 'playfair-display'] as const
export type FontKey = (typeof FONT_KEYS)[number]

/** `theme.palette.<role>` to the CSS/Tailwind key it drives. Role names exist only in the admin and here. */
export const PALETTE_FIELDS = {
  primary: 'black',
  accent: 'gold',
  surface: 'cream',
  text: 'charcoal',
  muted: 'grey',
} as const satisfies Record<string, BrandKey>

/** `theme.shades.<name>` to the key it drives. */
export const SHADE_FIELDS = {
  ink: 'ink',
  accentDark: 'gold-dark',
  accentLight: 'gold-light',
  accentPale: 'gold-pale',
  accentDeep: 'gold-deep',
  surfaceMuted: 'stone',
  mutedLight: 'grey-light',
} as const satisfies Record<string, BrandKey>

export type PaletteRole = keyof typeof PALETTE_FIELDS
export type ShadeName = keyof typeof SHADE_FIELDS

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** `#abc` or `#aabbcc` (any case) to `#AABBCC`; anything else is null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase()
  return HEX_RE.test(v) ? v.toUpperCase() : null
}

/** `#0B0B0D` to `11 11 13` (the space-separated channel triple CSS `rgb(var(--x) / a)` wants). */
export function hexToChannels(hex: string): string {
  const n = normalizeHex(hex)
  if (!n) throw new Error(`Not a hex colour: ${hex}`)
  return [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16)).join(' ')
}
