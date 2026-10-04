/**
 * The ONLY file allowed to hold brand hex values (tests/no-brand-hex.test.ts enforces it).
 * These are Lang Lang Cricket Club's colours and display font. They are the seed defaults of the
 * `theme` global and the fallback of `resolveTheme()`, so a database with no saved theme renders
 * the Lang Lang look. A new club changes them in Admin > Advanced > Site look (or edits this file
 * to change the seed).
 */
export const THEME_DEFAULTS = {
  palette: {
    /** Dark surface, headings, dark buttons (CSS `--brand-black`). */
    primary: '#0B0B0D',
    /** CTAs, active nav, focus ring, selection (`--brand-gold`). */
    accent: '#F5B700',
    /** Alternate section band (`--brand-cream`). */
    surface: '#FAF7EF',
    /** Body text on light (`--brand-charcoal`). */
    text: '#26262B',
    /** Secondary copy (`--brand-grey`). */
    muted: '#5A5A62',
  },
  shades: {
    /** Raised dark surface (`--brand-ink`). */
    ink: '#17171A',
    /** Gradient start stop (`--brand-gold-dark`). */
    accentDark: '#C99400',
    /** Hover for accent buttons, labels on dark (`--brand-gold-light`). */
    accentLight: '#FFD966',
    /** Tinted surfaces: chips, callouts, date tiles (`--brand-gold-pale`). */
    accentPale: '#FFF4CC',
    /** Small accent text on light backgrounds (`--brand-gold-deep`). */
    accentDeep: '#8A6500',
    /** Card fills, empty states (`--brand-stone`). */
    surfaceMuted: '#F3F1EA',
    /** Captions, placeholders (`--brand-grey-light`). */
    mutedLight: '#6E6E76',
  },
  headingFont: 'barlow-condensed',
} as const

export type ThemeDefaults = typeof THEME_DEFAULTS

/** A second, blue club look for eyeballing the theme locally (`seed:demo --theme-sample blue`). Never a default. */
export const THEME_SAMPLE_BLUE = {
  palette: { primary: '#0A1F44', accent: '#4B96F0', surface: '#F2F6FC', text: '#1B2A41', muted: '#4A5568' },
  shades: { ink: '#10294F', accentDark: '#2F7BD8', accentLight: '#A9CCFA', accentPale: '#DCEBFE', accentDeep: '#1A4F9C', surfaceMuted: '#E8EEF7', mutedLight: '#566174' },
  headingFont: 'oswald',
} as const
