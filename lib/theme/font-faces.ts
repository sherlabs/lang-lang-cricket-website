/**
 * The five display faces as `next/font/local` instances. next/font needs static literals at module
 * scope, so each face is spelled out; `lib/theme/fonts.ts` is the manifest of the same files and a test
 * checks they agree. Import this only from the frontend shell (never from unit-tested code). All five
 * variable classes go on <body>; the browser downloads only the face that is actually used.
 */
import localFont from 'next/font/local'
import type { FontKey } from './tokens'

// Only Barlow Condensed (the seed default and Lang Lang's face) is preloaded. next/font decides preloading
// statically per module at build time, so the chosen face cannot be picked from the saved theme; the other
// four load on demand when a club selects them (display: swap, system fallback until then).
const barlowCondensed = localFont({
  src: [
    { path: '../../assets/fonts/BarlowCondensed-500.woff2', weight: '500', style: 'normal' },
    { path: '../../assets/fonts/BarlowCondensed-600.woff2', weight: '600', style: 'normal' },
    { path: '../../assets/fonts/BarlowCondensed-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-h-barlow-condensed',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'sans-serif'],
})
const oswald = localFont({
  src: [
    { path: '../../assets/fonts/Oswald-500.woff2', weight: '500', style: 'normal' },
    { path: '../../assets/fonts/Oswald-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-h-oswald',
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
})
const bebasNeue = localFont({
  src: [{ path: '../../assets/fonts/BebasNeue-400.woff2', weight: '400', style: 'normal' }],
  variable: '--font-h-bebas-neue',
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
})
const anton = localFont({
  src: [{ path: '../../assets/fonts/Anton-400.woff2', weight: '400', style: 'normal' }],
  variable: '--font-h-anton',
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
})
const playfairDisplay = localFont({
  src: [{ path: '../../assets/fonts/PlayfairDisplay-700.woff2', weight: '700', style: 'normal' }],
  variable: '--font-h-playfair-display',
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
})

/** Space-separated class names that define every `--font-h-<key>` variable. */
export const HEADING_FONT_CLASSES = [barlowCondensed, oswald, bebasNeue, anton, playfairDisplay].map((f) => f.variable).join(' ')

/** The CSS variable holding the chosen face's family stack. */
export const headingFontVar = (key: FontKey): string => `var(--font-h-${key})`
