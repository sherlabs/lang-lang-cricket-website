import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Static guards for the opposition scouting report (wave E, WP-1). Opposition players' names are third-party personal data held for
 * selection use only, so the code that reads them must stay on the selector side: pure functions with no I/O, one loader, one query
 * module, nothing cached, nothing public.
 */
const root = path.resolve(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(path.relative(root, full))
  }
  return out
}
const importsOf = (src: string) => [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])

describe('scouting: pure modules', () => {
  const files = walk(path.join(root, 'lib/scouting'))
  it('scans the scouting functions', () => {
    expect(files.length).toBeGreaterThanOrEqual(8)
  })
  it('import no payload, no next/*, no server-only and no lib/*-queries module', () => {
    const bad: string[] = []
    for (const f of files) {
      for (const spec of importsOf(read(f))) {
        if (spec === 'payload' || spec.startsWith('payload/') || spec.startsWith('@payloadcms') || spec.startsWith('next/') || spec === 'next' || spec === 'server-only' || /-queries$/.test(spec) || /\/match-store\//.test(spec)) bad.push(`${f}: ${spec}`)
      }
    }
    expect(bad).toEqual([])
  })
})

describe('scouting: opposition names never reach a cache or a public reader', () => {
  const loader = 'lib/match-store/scouting-read.ts'
  const queries = 'lib/selector-scouting-queries.ts'
  const all = ['app', 'components', 'lib', 'payload'].flatMap((d) => walk(path.join(root, d)))

  it('only the selector query module imports the loader, and only selector pages and components import that module', () => {
    const loaderImporters = all.filter((f) => f !== loader && importsOf(read(f)).some((s) => s.endsWith('match-store/scouting-read')))
    expect(loaderImporters).toEqual([queries])
    const queryImporters = all.filter((f) => f !== queries && importsOf(read(f)).some((s) => s.endsWith('selector-scouting-queries'))).sort()
    expect(queryImporters.length).toBeGreaterThan(0)
    expect(queryImporters.filter((f) => !f.startsWith('app/(frontend)/selector/') && !f.startsWith('components/selector/'))).toEqual([])
  })
  it('the loader and the query module use no unstable_cache, cached() or tag', () => {
    for (const f of [loader, queries]) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(src, f).not.toMatch(/unstable_cache|\bcached\(|revalidateTag|cacheTag|cacheLife|'use cache'/)
    }
  })
  it('no cached reader under lib/match-store or lib/stats reads opposition people', () => {
    const readers = all.filter((f) => /^lib\/(match-store|stats)\//.test(f) && f !== loader)
    const hits = readers.filter((f) => /isClubSide['"]?\s*:\s*\{\s*equals\s*:\s*false/.test(read(f)) || /scouting-read/.test(read(f)))
    expect(hits).toEqual([])
  })
  it('the loader reads opposition appearances only', () => {
    expect(read(loader)).toMatch(/isClubSide: \{ equals: false \}/)
  })
})

describe('scouting: pages and routes', () => {
  const pages = ['app/(frontend)/selector/(area)/scouting/page.tsx', 'app/(frontend)/selector/(area)/scouting/[opp]/page.tsx']
  it('are dynamic, noindex and gated by requireSelection', () => {
    for (const p of pages) {
      const src = read(p)
      expect(src, p).toMatch(/export const dynamic = 'force-dynamic'/)
      expect(src, p).toMatch(/robots: \{ index: false, follow: false \}/)
      expect(src, p).toMatch(/requireSelection\(/)
    }
  })
  it('the selector area is served private, no-store by next.config', () => {
    const cfg = read('next.config.ts')
    const block = /source: '\/selector\/:path\*',\s*headers: \[([\s\S]*?)\]/.exec(cfg)?.[1] ?? ''
    expect(block).toMatch(/Cache-Control/)
    expect(block).toMatch(/private, no-store/)
  })
  it('have no route handler, OG image, share button or export beside them', () => {
    const files = walk(path.join(root, 'app/(frontend)/selector/(area)/scouting'))
    expect(files.filter((f) => /route\.tsx?$|opengraph-image|twitter-image|\/export/.test(f))).toEqual([])
    const ui = ['components/selector/scouting-report.tsx', 'components/selector/scout-link.tsx', 'components/selector/scout-print-button.tsx', ...pages].map(read).join('\n')
    expect(ui).not.toMatch(/ShareButton|navigator\.share|toCsv|ImageResponse|themedImageResponse/)
  })
  it('the report page does not echo the key into a title, heading or log', () => {
    const src = read('app/(frontend)/selector/(area)/scouting/[opp]/page.tsx')
    expect(src).not.toMatch(/console\./)
    expect(src).not.toMatch(/title:\s*`/)
    expect(src).not.toMatch(/<h1[^>]*>\{key\}/)
  })
  it('take the club name from getClub, not a literal', () => {
    expect(read('app/(frontend)/selector/(area)/scouting/[opp]/page.tsx')).toMatch(/getClub\(\)/)
  })
})
