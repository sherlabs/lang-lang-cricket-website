import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Static guards for the best XI suggester (wave E, WP-2): the rules are pure, the query module and its action can save a draft and
 * nothing else (no publish, withdraw, announcement, notification, email, social or network code), the page is selector-only and
 * never static, and nothing club-specific is typed into the code.
 */
const root = path.resolve(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const importsOf = (src: string) => [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
/** Names imported from a module with braces, e.g. `import { a, type B } from 'x'` gives a, B. */
const namedImports = (src: string) => [...src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from/g)].flatMap((m) => m[1].split(',').map((n) => n.replace(/\btype\b/, '').trim().split(/\s+as\s+/)[0]).filter(Boolean))

const PURE = ['lib/selection/xi.ts', 'lib/selection/xi-links.ts']
const PAGE = 'app/(frontend)/selector/(area)/teams/[gameId]/suggest/page.tsx'
const ACTION = 'app/(frontend)/selector/suggest-actions.ts'
const QUERIES = 'lib/selector-xi-queries.ts'
const UI = ['components/selector/xi-suggestion.tsx', 'components/selector/use-xi-bar.tsx']
const ALL = [...PURE, PAGE, ACTION, QUERIES, ...UI]

describe('best XI: the rules are pure', () => {
  it('import no payload, no next/*, no server-only and no lib/*-queries module', () => {
    const bad: string[] = []
    for (const f of PURE) {
      for (const spec of importsOf(stripComments(read(f)))) {
        if (spec === 'payload' || spec.startsWith('payload/') || spec.startsWith('@payloadcms') || spec.startsWith('next/') || spec === 'next' || spec === 'server-only' || /-queries$/.test(spec) || /match-store/.test(spec)) bad.push(`${f}: ${spec}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('read no clock and no randomness, so the same input always gives the same team', () => {
    for (const f of PURE) expect(stripComments(read(f)), f).not.toMatch(/Math\.random|Date\.now|new Date\(|crypto/)
  })
  it('compare by an ordered tuple and never build a score', () => {
    const src = stripComments(read('lib/selection/xi.ts'))
    expect(src).not.toMatch(/\bscore\b|\brating\b|\bweight/i)
  })
})

describe('best XI: saves a draft and nothing else', () => {
  const FORBIDDEN_NAMES = ['publishSheets', 'withdrawSheet', 'publishTeamsAction', 'withdrawTeamAction', 'upsertWeekendAnnouncement']
  it('no module imports publish, withdraw, announcement, notification, email, social or share code', () => {
    const bad: string[] = []
    for (const f of [PAGE, ACTION, QUERIES, ...UI]) {
      const src = stripComments(read(f))
      for (const n of namedImports(src)) if (FORBIDDEN_NAMES.includes(n)) bad.push(`${f}: ${n}`)
      for (const spec of importsOf(src)) if (/announce|notif|email|social|share|facebook|teams-queries|team-share|resend|nodemailer/i.test(spec)) bad.push(`${f}: ${spec}`)
      for (const n of FORBIDDEN_NAMES) if (new RegExp(`\\b${n}\\b`).test(src)) bad.push(`${f} mentions ${n}`)
      if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(src)) bad.push(`${f}: network call`)
    }
    expect(bad).toEqual([])
  })
  it('the only write in the query module is the existing save path', () => {
    const src = stripComments(read(QUERIES))
    expect(src).not.toMatch(/payload\.(create|update|delete|updateGlobal)\(/)
    expect(src).not.toMatch(/\.db\./)
    expect(src).toMatch(/return saveSheet\(user,/)
    expect(src).toMatch(/markedReady: false/)
    expect(src).not.toMatch(/publishedSnapshot|publishCount|publishedBy/)
  })
  it('the query module opens every exported function with assertSelection', () => {
    const src = stripComments(read(QUERIES))
    for (const m of src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\s*\n\s*(assertSelection\(user\))?/g)) expect(m[2], m[1]).toBe('assertSelection(user)')
  })
  it('uses no cache or tag, so a proposal is never shared between requests', () => {
    for (const f of [QUERIES, PAGE]) expect(stripComments(read(f)), f).not.toMatch(/unstable_cache|\bcached\(|revalidateTag|cacheTag|cacheLife|'use cache'/)
  })
})

describe('best XI: page and action', () => {
  it('the page is dynamic, noindex and gated by requireSelection, and talks to no database', () => {
    const src = read(PAGE)
    expect(src).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(src).toMatch(/robots: \{ index: false, follow: false \}/)
    expect(src).toMatch(/requireSelection\(/)
    expect(stripComments(src)).not.toMatch(/payload|getPayloadClient/)
  })
  it('the action is a server action that calls requireSelection first and trusts nothing but the verified user', () => {
    const src = stripComments(read(ACTION))
    expect(src.trimStart()).toMatch(/^'use server'/)
    const body = src.slice(src.indexOf('export async function'))
    expect(body.indexOf('requireSelection(')).toBeGreaterThan(-1)
    expect(body.indexOf('requireSelection(')).toBeLessThan(body.indexOf('applySuggestion('))
    expect(src).not.toMatch(/updatedBy|publishedBy|publish/i)
    expect(src).not.toMatch(/payload|getPayloadClient/)
  })
  it('the sitemap and robots stay clear of it (the selector area is never listed)', () => {
    expect(read('app/sitemap.ts')).not.toMatch(/selector/)
  })
})

describe('best XI: club-neutral and brand-token only', () => {
  it('no club name and no hex literal in any file of this module', () => {
    for (const f of ALL) {
      const src = stripComments(read(f))
      expect(src, f).not.toMatch(/Lang\s?Lang/i)
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })
  it('the defaults live in config/site.ts and the page takes the club from getClub()', () => {
    expect(read('config/site.ts')).toMatch(/export const SELECTION = \{/)
    expect(read(PAGE)).toMatch(/getClub\(\)/)
  })
})
