/**
 * The brand palette, defined once. `tailwind.config.ts` spreads it into `colors.brand`, and
 * server-rendered images (the player stat card, where satori cannot read CSS or Tailwind
 * classes) read the same values, so a re-colour changes both together. No theme tokens exist
 * in the `club` global yet; when they do, resolve them here.
 */
export const BRAND = {
  black: '#0B0B0D',
  ink: '#17171A',
  charcoal: '#26262B',
  gold: '#F5B700',
  'gold-dark': '#C99400',
  'gold-light': '#FFD966',
  'gold-pale': '#FFF4CC',
  // Darkened gold for small text on light backgrounds (>= 4.5:1 on white and gold-pale).
  'gold-deep': '#8A6500',
  cream: '#FAF7EF',
  stone: '#F3F1EA',
  // Warm neutrals for body/muted copy so we never reach for Tailwind's default greys.
  grey: '#5A5A62',
  'grey-light': '#6E6E76',
} as const
