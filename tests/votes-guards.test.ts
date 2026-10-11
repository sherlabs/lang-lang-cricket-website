import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BallotForm } from '@/components/votes/ballot-form'
import { RACE_DASHES, RACE_FILLS, RACE_MARKERS, RACE_STROKES } from '@/components/votes/race-chart'

const root = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n')
const walk = (dir: string, out: string[] = []): string[] => {
  const full = path.join(root, dir)
  if (!fs.existsSync(full)) return out
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel)
  }
  return out
}
const VOTE_FILES = [...walk('lib/votes'), ...walk('components/votes'), ...walk('app/(frontend)/votes'), ...walk('app/(frontend)/selector/(area)/votes'), ...walk('app/(frontend)/selector/present'), ...walk('app/(frontend)/availability/[token]/vote'), 'lib/votes-queries.ts', 'lib/selector-votes-queries.ts', 'app/(frontend)/selector/votes-actions.ts', 'app/api/admin/votes-export/route.ts']

describe('best-player votes: club vocabulary and config (wave B spec 1)', () => {
  it('no vote file types the award word, a cookie name or a club name; the label comes from config', () => {
    for (const f of VOTE_FILES) {
      const text = code(read(f))
      expect(/best player|player of the match/i.test(text), `${f} types the award label`).toBe(false)
      expect(/llcc|lang lang/i.test(text), `${f} types a club value`).toBe(false)
    }
    expect(read('config/site.ts')).toContain("'Best player'")
  })

  it('the whole code base outside config and seed has no "Best player" literal', () => {
    const hits: string[] = []
    for (const dir of ['app', 'components', 'lib', 'payload']) {
      for (const f of walk(dir)) {
        if (/^payload\/(seed|scripts|migrations)\//.test(f)) continue
        if (/best player|player of the match/i.test(code(read(f)))) hits.push(f)
      }
    }
    expect(hits).toEqual([])
  })

  it('the vote flow reads the cookie through availCookieName and never types the cookie name', () => {
    expect(read('app/(frontend)/availability/[token]/vote/[fixtureId]/actions.ts')).toContain('availCookieName')
    expect(read('app/(frontend)/availability/[token]/vote/[fixtureId]/page.tsx')).toContain('availCookieName')
    for (const f of VOTE_FILES) expect(/_avail['"`]/.test(code(read(f))), f).toBe(false)
  })

  it('weekday text is derived from the date, never typed ("vote by Sunday")', () => {
    for (const f of VOTE_FILES) expect(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(code(read(f))), f).toBe(false)
  })

  it('every vote file sits under a root the brand-hex guard scans, and has no hex colour', () => {
    for (const f of VOTE_FILES) {
      expect(/^(app|components|lib|payload|config)\//.test(f), f).toBe(true)
      expect(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/.test(code(read(f))), `${f} has a hex colour`).toBe(false)
    }
  })

  it('vote pages and actions never override access from the public side (availability and the public page)', () => {
    for (const f of [...walk('app/(frontend)/availability/[token]/vote'), ...walk('app/(frontend)/votes')]) {
      const text = code(read(f))
      expect(/overrideAccess/.test(text), f).toBe(false)
      expect(/\.db\./.test(text), f).toBe(false)
      expect(/payload\s*\.\s*(find|findByID|create|update|delete|count)\s*\(/.test(text), f).toBe(false)
    }
  })

  it('the chart colour cycle has five different tokens, dash patterns and marker shapes, and no hex', () => {
    for (const set of [RACE_STROKES, RACE_FILLS, RACE_DASHES, RACE_MARKERS]) expect(new Set(set).size).toBe(5)
    for (const t of [...RACE_STROKES, ...RACE_FILLS]) expect(t).toMatch(/^(stroke|fill)-brand-[a-z-]+$/)
  })

  it('the ballot form is plain HTML: native selects with labels and a submit button, no script needed', () => {
    const html = renderToStaticMarkup(
      BallotForm({ action: '/vote' as never, hidden: { token: 't', fixtureId: '4' }, options: [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bo' }], values: [3, 2, 1], places: 3, existing: [{ place: 1, playerId: 2 }], submitLabel: 'Send my vote' }),
    )
    expect(html.match(/<select/g)).toHaveLength(3)
    expect(html).toContain('3 votes')
    expect(html).toContain('1 vote<')
    expect(html).toMatch(/<label[^>]*for="place_1"/)
    expect(html).toMatch(/<select id="place_1" name="place_1" required=""/)
    expect(html).toContain('<button type="submit"')
    expect(html).toContain('action="/vote"')
    expect(html).toContain('<option value="2" selected="">Bo</option>')
    expect(html).not.toMatch(/<script/)
  })
})

describe('best-player votes: headers, sitemap and navigation', () => {
  it('the nested vote route is under the availability no-store and no-referrer rule', async () => {
    const { default: config } = await import('../next.config')
    const rules = await (config as { headers: () => Promise<Array<{ source: string; headers: { key: string; value: string }[] }>> }).headers()
    const rule = rules.find((r) => r.source === '/availability/:path*')!
    expect(rule.headers.find((h) => h.key === 'Cache-Control')?.value).toMatch(/no-store/)
    expect(rule.headers.find((h) => h.key === 'Referrer-Policy')?.value).toBe('no-referrer')
    // `:path*` matches nested segments, so `/availability/<token>/vote/<id>` is covered.
    expect('/availability/abc/vote/12'.startsWith('/availability/')).toBe(true)
  })

  it('/votes is in the stats nav family and the presenter and settings routes are outside the public site', () => {
    expect(read('components/site-nav.tsx')).toContain("'/votes'")
    expect(fs.existsSync(path.join(root, 'app/(frontend)/selector/present/votes/page.tsx'))).toBe(true)
    // The presenter page is not under the (area) layout (no tab bar), and still starts with requireSelection.
    expect(read('app/(frontend)/selector/present/votes/page.tsx')).toContain('requireSelection(')
  })

  it('the votes export is admin only and phones, PINs and ballots are in no export column set', () => {
    expect(read('app/api/admin/votes-export/route.ts')).toContain('requireStaff')
    expect(read('lib/selector-votes-queries.ts')).toMatch(/exportVotesCsv[\s\S]*isAdminUser/)
    expect(/picks|voterKey|phone/i.test(read('lib/votes/csv.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))).toBe(false)
  })
})
