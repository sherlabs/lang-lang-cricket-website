/**
 * Guard: club colours live in the `theme` global (seed: payload/seed/theme-defaults.ts) and reach code only
 * through Tailwind `brand-*` classes, `--brand-*` variables or `getTheme().colors`. This test fails when a
 * brand hex, a brand channel triple or any other six/eight-digit hex literal appears in app code.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../lib/theme/resolve'
import { hexToChannels } from '../lib/theme/tokens'

const root = path.resolve(__dirname, '..')

/** Scanned roots. The seed file `payload/seed/theme-defaults.ts` is the ONLY place allowed to hold brand hex, and it is outside these roots. */
const ROOTS = ['app', 'components', 'lib', 'payload', 'config', 'tailwind.config.ts']
/** Seed data, one-off scripts and migrations legitimately hold Lang Lang values (the preset), so they are never scanned. */
const SKIP_DIRS = ['payload/seed', 'payload/scripts', 'payload/migrations']
const EXT = /\.(ts|tsx|css|scss|mjs|js)$/
/** Neutral constants (not theme values), named once in lib/theme/og.tsx. Three-digit #fff and #000 are always legal. */
const NEUTRAL_HEX = /^#(ffffff|000000)([0-9a-f]{2})?$/i

function walk(p: string, out: string[] = []): string[] {
  const full = path.join(root, p)
  if (statSync(full).isDirectory()) {
    for (const e of readdirSync(full)) {
      if (e === 'node_modules' || e === '.next' || e === 'importMap.js') continue
      const child = path.join(p, e)
      if (SKIP_DIRS.includes(child)) continue
      walk(child, out)
    }
  } else if (EXT.test(p)) out.push(p)
  return out
}

const files = ROOTS.flatMap((r) => walk(r))
const stripped = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Code with comments removed (block and line), for the club-name guard: names in comments are harmless. */
const code = (rel: string) =>
  stripped(rel)
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')

const seed = Object.values(resolveTheme(null).colors)
const triples = seed.map((h) => hexToChannels(h).split(' '))

describe('no brand hex in code', () => {
  it('scans a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('has none of the twelve seed hex values', () => {
    const bad = files.filter((f) => seed.some((h) => new RegExp(h, 'i').test(stripped(f))))
    expect(bad).toEqual([])
  })

  it('has none of the twelve channel triples (rgb(11 11 13 / .1) style tints)', () => {
    const bad = files.filter((f) => {
      const text = stripped(f)
      return triples.some(([r, g, b]) => new RegExp(`(?<![\\d.])${r}\\s*[ ,]\\s*${g}\\s*[ ,]\\s*${b}(?!\\d)`).test(text))
    })
    expect(bad).toEqual([])
  })

  it('has no other six- or eight-digit hex literal except the neutral white/black', () => {
    const bad: string[] = []
    for (const f of files) {
      for (const m of stripped(f).matchAll(/#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?(?![0-9a-zA-Z_-])/g)) {
        if (!NEUTRAL_HEX.test(m[0])) bad.push(`${f}: ${m[0]}`)
      }
    }
    expect(bad).toEqual([])
  })
})

/** The only non-seed files that may name the club: the per-club build file (env defaults for dev and test). */
const NAME_ALLOWLIST = ['config/site.ts']
const CLUB_NAME = /lang ?lang|caldermeade|llcc/i

describe('no club name in code', () => {
  it('Lang Lang, Caldermeade and llcc appear only in seeds, scripts, migrations and config/site.ts', () => {
    const scanned = [...files, 'next.config.ts', 'payload.config.ts', 'instrumentation.ts']
    const bad = scanned.filter((f) => !NAME_ALLOWLIST.includes(f) && CLUB_NAME.test(code(f)))
    expect(bad).toEqual([])
  })
})
