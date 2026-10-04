/**
 * Pure theme resolution (no Next or Payload imports). `resolveTheme(null)` is the seed: Lang Lang's
 * colours, display font and crest. A saved `theme` global overrides it field by field; an invalid
 * stored colour falls back to the seed value so a bad row can never break the site or inject CSS.
 */
import { BRANDING } from '@/config/site'
import { seedColors } from './seed-colors'
import { DEFAULT_FONT, FONT_MENU } from './fonts'
import { FONT_KEYS, PALETTE_FIELDS, SHADE_FIELDS, BRAND_KEYS, hexToChannels, normalizeHex, type BrandKey, type FontKey } from './tokens'

export type ResolvedTheme = {
  /** '#RRGGBB', for satori, canvas, PDFs, emails. */
  colors: Record<BrandKey, string>
  /** '11 11 13', for CSS variables. */
  channels: Record<BrandKey, string>
  font: { key: FontKey; label: string; family: string; ogWeight: number }
  /** theme.crest, else the legacy club.logo, else BRANDING.logo. */
  crest: { url: string }
  /** Changes whenever the theme or the crest file is saved ('' for the seed). Cache key for derived crest data. */
  version: string
}

type MediaLike = { url?: string | null } | number | string | null | undefined
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const mediaUrl = (m: MediaLike): string | null => (isObj(m) && typeof m.url === 'string' && m.url ? m.url : null)

/**
 * `doc` is `findGlobal('theme', depth 1)` or null. `opts.clubLogoUrl` is the legacy Club details logo
 * (null when none is uploaded). This is the ONLY place the crest chain is resolved.
 */
export function resolveTheme(doc: unknown, opts: { clubLogoUrl?: string | null } = {}): ResolvedTheme {
  const colors = seedColors()
  const saved = isObj(doc) ? doc : {}
  const palette = isObj(saved.palette) ? saved.palette : {}
  const shades = isObj(saved.shades) ? saved.shades : {}
  for (const [name, key] of Object.entries(PALETTE_FIELDS)) colors[key] = normalizeHex(palette[name]) ?? colors[key]
  for (const [name, key] of Object.entries(SHADE_FIELDS)) colors[key] = normalizeHex(shades[name]) ?? colors[key]

  const channels = {} as Record<BrandKey, string>
  for (const k of BRAND_KEYS) channels[k] = hexToChannels(colors[k])

  const fontKey: FontKey = (FONT_KEYS as readonly string[]).includes(saved.headingFont as string) ? (saved.headingFont as FontKey) : DEFAULT_FONT
  const menu = FONT_MENU[fontKey]

  const crestUrl = mediaUrl(saved.crest as MediaLike) ?? (opts.clubLogoUrl?.trim() || null) ?? BRANDING.logo
  const crestDoc = isObj(saved.crest) ? saved.crest : {}
  const stamp = (v: unknown) => (typeof v === 'string' ? v : '')
  const version = saved.updatedAt || crestDoc.updatedAt ? `${stamp(saved.updatedAt)}|${stamp(crestDoc.updatedAt)}` : ''
  return {
    colors,
    channels,
    font: { key: fontKey, label: menu.label, family: menu.family, ogWeight: menu.ogWeight },
    crest: { url: crestUrl },
    version,
  }
}
