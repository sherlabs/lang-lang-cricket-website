import type { FontKey } from './tokens'

export type FontFace = {
  weight: 400 | 500 | 600 | 700
  /** Static TrueType for satori / next/og (it cannot read woff2 or variable fonts). Relative to the repo root. */
  ttf: string
  /** Latin + Latin-extended subset for the web (`next/font/local`). */
  woff2: string
}

export type FontMenuEntry = {
  label: string
  /** CSS family name, used in the fallback stack and in OG font registration. */
  family: string
  faces: FontFace[]
  /** The weight the OG image loader reads for display text. */
  ogWeight: 400 | 500 | 600 | 700
  /** OFL text, relative to the repo root. */
  licence: string
}

const f = (file: string, weight: FontFace['weight']): FontFace => ({ weight, ttf: `assets/fonts/${file}.ttf`, woff2: `assets/fonts/${file}.woff2` })

/** The fixed menu of display faces (all SIL OFL 1.1). Pure data: safe to import anywhere, including tests. */
export const FONT_MENU: Record<FontKey, FontMenuEntry> = {
  'barlow-condensed': {
    label: 'Barlow Condensed (athletic condensed)',
    family: 'Barlow Condensed',
    faces: [f('BarlowCondensed-500', 500), f('BarlowCondensed-600', 600), f('BarlowCondensed-700', 700)],
    ogWeight: 700,
    licence: 'assets/fonts/LICENSES/barlowcondensed.txt',
  },
  oswald: {
    label: 'Oswald (condensed, slightly softer)',
    family: 'Oswald',
    faces: [f('Oswald-500', 500), f('Oswald-700', 700)],
    ogWeight: 700,
    licence: 'assets/fonts/LICENSES/oswald.txt',
  },
  'bebas-neue': {
    label: 'Bebas Neue (poster capitals)',
    family: 'Bebas Neue',
    faces: [f('BebasNeue-400', 400)],
    ogWeight: 400,
    licence: 'assets/fonts/LICENSES/bebasneue.txt',
  },
  anton: {
    label: 'Anton (heavy condensed)',
    family: 'Anton',
    faces: [f('Anton-400', 400)],
    ogWeight: 400,
    licence: 'assets/fonts/LICENSES/anton.txt',
  },
  'playfair-display': {
    label: 'Playfair Display (heritage serif)',
    family: 'Playfair Display',
    faces: [f('PlayfairDisplay-700', 700)],
    ogWeight: 700,
    licence: 'assets/fonts/LICENSES/playfairdisplay.txt',
  },
}

export const DEFAULT_FONT: FontKey = 'barlow-condensed'

/** Body face used only by OG images (the site keeps `next/font/google` Inter). */
export const OG_BODY_FACES = [
  { weight: 400 as const, ttf: 'assets/fonts/Inter-400.ttf' },
  { weight: 700 as const, ttf: 'assets/fonts/Inter-700.ttf' },
]
export const OG_BODY_LICENCE = 'assets/fonts/LICENSES/inter.txt'
