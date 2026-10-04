import { THEME_DEFAULTS } from '@/payload/seed/theme-defaults'
import { PALETTE_FIELDS, SHADE_FIELDS, type BrandKey } from './tokens'

/** The seed palette as `#RRGGBB` per brand key. Pure and client-safe (no config or env imports). */
export function seedColors(): Record<BrandKey, string> {
  const out = {} as Record<BrandKey, string>
  for (const [name, key] of Object.entries(PALETTE_FIELDS)) out[key] = THEME_DEFAULTS.palette[name as keyof typeof THEME_DEFAULTS.palette].toUpperCase()
  for (const [name, key] of Object.entries(SHADE_FIELDS)) out[key] = THEME_DEFAULTS.shades[name as keyof typeof THEME_DEFAULTS.shades].toUpperCase()
  return out
}
