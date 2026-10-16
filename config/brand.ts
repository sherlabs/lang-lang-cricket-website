/**
 * The brand colour keys and their Tailwind mapping. The VALUES live in the `theme` global (seed:
 * `payload/seed/theme-defaults.ts`) and reach the page as `--brand-<key>` CSS variables (`<ThemeStyle>`),
 * so `bg-brand-gold/40`, `ring-brand-black/5` and gradient stops keep working and a re-colour needs no
 * rebuild. Server-rendered images read `getTheme().colors` instead. No hex literals here (guard test).
 */
import { BRAND_KEYS, type BrandKey } from '../lib/theme/tokens'

export { BRAND_KEYS }
export type { BrandKey }

/** Success, caution and error colours for messages and buttons, as `--status-*` channel triples (see globals.css). Same role names for every club. */
export const STATUS_KEYS = ['ok', 'ok-soft', 'ok-ink', 'warn', 'warn-soft', 'warn-ink', 'bad', 'bad-soft', 'bad-ink'] as const
export const STATUS_TW = Object.fromEntries(STATUS_KEYS.map((k) => [k, `rgb(var(--status-${k}) / <alpha-value>)`])) as Record<(typeof STATUS_KEYS)[number], string>

/** `{ black: 'rgb(var(--brand-black) / <alpha-value>)', ... }` for `tailwind.config.ts` `colors.brand`. */
export const BRAND_TW = Object.fromEntries(BRAND_KEYS.map((k) => [k, `rgb(var(--brand-${k}) / <alpha-value>)`])) as Record<BrandKey, string>
