/**
 * Guard for the static files no admin screen can replace (favicon, home-screen icon, default share image, hero,
 * bundled crest, Search Console verification, the club's own policy PDF). They still hold Lang Lang's artwork. When
 * CANONICAL_HOST is another club's host, every one must have been replaced, or the other club publishes Lang
 * Lang imagery (shared links, home-screen icon, OG crest fallback). Lang Lang itself (the default host) always passes.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANONICAL_HOST } from '../config/site'

const root = path.resolve(__dirname, '..')
const sha = (rel: string) => {
  try {
    return createHash('sha256').update(readFileSync(path.join(root, rel))).digest('hex')
  } catch {
    return null // file removed or replaced by a club that deleted it: fine
  }
}

/** sha-256 of the Lang Lang originals. Update only when Lang Lang's own artwork changes. */
const LANG_LANG_FILES: Record<string, string> = {
  'app/favicon.ico': '43000b425d3e883f4566c5e484fe417c64286d3ce37778e9167d6d5a23dc7606',
  'public/apple-touch-icon.png': 'e6e0ca81034d3de567f6c8ab3c2dc23f0693ff8208230a5edaf6109750623410',
  'public/og-image.jpg': '1384b98b7dedec12c0fd287328f77e0559d8585d9b8ec44f22728d3a89c309d6',
  'public/assets/branding/hero.jpg': '67e34c5ed6e790a925771f9a84a77d88c55baad886f43a77fc8141edcc1e911f',
  'public/assets/branding/logo.png': 'c72bc404b012602fe44682c5c0f8da81ecdd19d477ce4932ff503cb44df0a029',
  'public/googlef3f9083034ceae06.html': '995162c43e1da7c58ea7d7fbbbcac86623a88af09c5c1758f7043b1e2997554d',
  'public/assets/documents/llcc-conflict-resolution-policy.pdf': 'e3144c48804746029db3621916ada0dd6c2fba4e566bb23dcf996892107255d5',
}

const LANG_LANG_HOST = 'langlangcricketclub.com'

describe('static branding files', () => {
  it('the guard knows the Lang Lang originals (so a replaced file is really detected)', () => {
    expect(Object.entries(LANG_LANG_FILES).filter(([f, h]) => sha(f) === h).length).toBeGreaterThan(0)
  })
  it.skipIf(CANONICAL_HOST === LANG_LANG_HOST)('another club has replaced every Lang Lang static file (see docs/features/multi-club-template.mdx)', () => {
    const stillLangLang = Object.entries(LANG_LANG_FILES).filter(([f, h]) => sha(f) === h).map(([f]) => f)
    expect(stillLangLang).toEqual([])
  })
})
