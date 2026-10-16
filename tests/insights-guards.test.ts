import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { INSIGHTS, insightsPaths } from '../config/site'

/**
 * Static guards for the Insights module (wave E, WP-3): the pure functions stay pure, the pages are read-only and public-safe,
 * the Stats menu owns the new routes, and nothing club-specific is typed into code.
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
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('insights: pure modules', () => {
  const files = walk(path.join(root, 'lib/insights'))
  it('scans the insight functions', () => {
    expect(files.length).toBeGreaterThanOrEqual(8)
  })
  it('import no payload, no next/*, no server-only, no match-store and no lib/*-queries module', () => {
    const bad: string[] = []
    for (const f of files) {
      for (const spec of importsOf(read(f))) {
        if (spec === 'payload' || spec.startsWith('payload/') || spec.startsWith('@payloadcms') || spec.startsWith('next/') || spec === 'next' || spec === 'server-only' || /-queries$/.test(spec) || /\/match-store\//.test(spec)) bad.push(`${f}: ${spec}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('never read opposition people or the selector side', () => {
    for (const f of files) expect(strip(read(f)), f).not.toMatch(/isClubSide|scouting|selector|nameKey|displayName/)
  })
})

describe('insights: pages', () => {
  const pages = ['app/(frontend)/stats/insights/page.tsx', 'app/(frontend)/stats/insights/trends/page.tsx', 'app/(frontend)/stats/insights/wickets/page.tsx', 'app/(frontend)/stats/insights/players/[slug]/page.tsx']
  it('exist and export no write handler or server action', () => {
    for (const p of pages) {
      const src = strip(read(p))
      expect(src, p).not.toMatch(/export (async )?function (POST|PUT|PATCH|DELETE)\b/)
      expect(src, p).not.toMatch(/'use server'/)
      expect(src, p).not.toMatch(/payload\.(create|update|delete)\b/)
    }
    expect(fs.readdirSync(path.join(root, 'app/(frontend)/stats/insights')).sort()).toEqual(['page.tsx', 'players', 'trends', 'wickets'])
    expect(fs.readdirSync(path.join(root, 'app/(frontend)/stats/insights/players/[slug]'))).toEqual(['page.tsx'])
  })
  it('read only the public cached readers, never the scouting loader or the selector queries', () => {
    const all = [...pages, 'lib/match-store/insights-queries.ts', 'components/stats/trend-chart.tsx', 'components/stats/insights-parts.tsx']
    for (const f of all) {
      const specs = importsOf(read(f))
      expect(specs.filter((s) => /scouting|selector|isClubSide/.test(s)), f).toEqual([])
    }
    expect(read('lib/match-store/insights-queries.ts')).not.toMatch(/isClubSide/)
  })
  it('the player trends page 404s for a slug that is not a visible player and renders per request', () => {
    const src = read('app/(frontend)/stats/insights/players/[slug]/page.tsx')
    expect(src).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(src).toMatch(/if \(!player\) notFound\(\)/)
    expect(src).toMatch(/getVisibleStatData/)
  })
  it('junior and non-default categories lose per-innings detail', () => {
    const src = read('app/(frontend)/stats/insights/players/[slug]/page.tsx')
    expect(src).toMatch(/defaultIncludedCategories/)
    expect(src).toMatch(/const bat = detail \?/)
    expect(src).toMatch(/const bowl = detail \?/)
  })
})

describe('insights: menu, sitemap and club-neutral copy', () => {
  it('the Stats menu has an Insights entry that points at the new route', () => {
    const src = read('components/stats/stats-sub-nav.tsx')
    expect(src).toMatch(/label: 'Insights'/)
    expect(src).toMatch(/insightsPaths\.team/)
    expect(insightsPaths.team).toBe('/stats/insights')
  })
  it('the site navigation keeps /stats/insights/* under the Stats item', () => {
    const src = read('components/site-nav.tsx')
    const family = /const STATS_FAMILY = \[([^\]]*)\]/.exec(src)?.[1] ?? ''
    expect(family).toContain("'/stats'")
    // The rule is "pathname equals or starts with <entry>/", so every Insights route is inside '/stats'.
    for (const p of [insightsPaths.team, insightsPaths.trends, insightsPaths.player('some-player')]) expect(p.startsWith('/stats/')).toBe(true)
    expect(src).toMatch(/pathname\.startsWith\(`\$\{p\}\/`\)/)
  })
  it('the sitemap lists the two public Insights pages and no player trend page', () => {
    const src = read('app/sitemap.ts')
    expect(src).toContain("'/stats/insights'")
    expect(src).toContain("'/stats/insights/trends'")
    expect(src).not.toMatch(/stats\/insights\/players/)
  })
  it('no club name is typed into the insight code, charts or pages', () => {
    const files = [...walk(path.join(root, 'lib/insights')), ...walk(path.join(root, 'app/(frontend)/stats/insights')), 'components/stats/trend-chart.tsx', 'components/stats/insights-parts.tsx', 'lib/match-store/insights-queries.ts']
    for (const f of files) expect(strip(read(f)), f).not.toMatch(/Lang Lang|langlang/i)
  })
  it('the wording says "compare seasons", and a direction label needs both a sample and a threshold', () => {
    const src = read('app/(frontend)/stats/insights/players/[slug]/page.tsx')
    // Visible text only (the <form> tag is markup): no sentence calls a number "form". Text with a {} expression in it counts too.
    for (const f of ['app/(frontend)/stats/insights/players/[slug]/page.tsx', 'app/(frontend)/stats/insights/trends/page.tsx', 'app/(frontend)/stats/insights/page.tsx', 'components/stats/trend-chart.tsx', 'components/stats/insights-parts.tsx']) {
      // Every use of the word outside a <form> tag, whatever surrounds it (text with {} expressions and `>=` included).
      expect(strip(read(f)).match(/(?<!<\/?)\bform\b/gi) ?? [], f).toEqual([])
    }
    expect(src).toMatch(/compared with/)
    const lib = read('lib/insights/player-trends.ts')
    expect(lib).toMatch(/not enough games to compare/)
  })
  it('the thresholds are config, not literals in the pages', () => {
    expect(INSIGHTS.teamMinGames).toBeGreaterThan(0)
    for (const p of ['app/(frontend)/stats/insights/page.tsx', 'app/(frontend)/stats/insights/trends/page.tsx']) expect(read(p)).toMatch(/INSIGHTS/)
  })
})
