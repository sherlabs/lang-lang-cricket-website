import { describe, expect, it } from 'vitest'
import { ImageResponse } from 'next/og'
import { emptyShare } from '@/lib/social/fit'
import { renderGraphic } from '@/lib/social/render'
import { SPECS } from '@/lib/social/specs'
import { SIZE_KEYS, SIZES, STYLE_KEYS, type GraphicType } from '@/lib/social/types'
import { loadThemeFonts } from '@/lib/theme/fonts-server'
import { resolveTheme } from '@/lib/theme/resolve'
import { LAYOUT_CASES, measure, demoLogo } from './helpers/layout-metrics'
import { TINY_PNG } from './helpers/social-fixtures'
import { thresholds } from './social-layout-thresholds'
import type { LineupData } from '@/lib/social/specs/lineup'
import type { LeadersData } from '@/lib/social/specs/stats-leaders'
import type { ResultData } from '@/lib/social/specs/result'
import type { SponsorThanksData } from '@/lib/social/specs/sponsor-thanks'

const theme = resolveTheme(null)
const cases = new Map(LAYOUT_CASES.map((c) => [c.id, c]))

/** Real renders through satori, measured as pixels; the matrix is the owner's flagged types (sponsor thank-you, results, leaders). */
describe('layout quality (rendered, not estimated)', () => {
  const rows = thresholds()
  it('has a threshold for every flagged cell, derived by the written rule', () => {
    expect(rows.length).toBe(81)
    for (const r of rows) expect(r.target).toBeLessThanOrEqual(0.25)
  })

  it('every flagged type x size x style leaves no more of the content box empty than its threshold', async () => {
    const failures: string[] = []
    const cache = new Map<string, unknown>()
    for (const r of rows) {
      const [id, size, style] = r.key.split('|')
      const c = cases.get(id)!
      if (!cache.has(id)) cache.set(id, await c.data())
      const m = await measure(cache.get(id), c.type, size as never, style as never)
      if (m.unused > r.ceiling + 0.005) failures.push(`${r.key}: ${(m.unused * 100).toFixed(1)}% empty, allowed ${(r.ceiling * 100).toFixed(0)}% (was ${(r.before * 100).toFixed(0)}%)`)
    }
    expect(failures).toEqual([])
  }, 240_000)

  it('the layout-time estimator stays within five percentage points of the pixel metric', async () => {
    const off: string[] = []
    for (const c of LAYOUT_CASES) {
      const data = await c.data()
      for (const size of SIZE_KEYS) {
        for (const style of STYLE_KEYS) {
          const px = (await measure(data, c.type, size, style)).unused
          const est = emptyShare(SPECS[c.type].layout(data as never, style, size), size, style)
          if (Math.abs(est - px) > 0.05) off.push(`${c.id}|${size}|${style}: estimate ${(est * 100).toFixed(0)}% vs measured ${(px * 100).toFixed(0)}%`)
        }
      }
    }
    expect(off).toEqual([])
  }, 240_000)
})

/** The audited strings: long opposition, sponsor, player and grade names must be fitted, never cut with an ellipsis. */
describe('text is fitted, not cut', () => {
  const OPP = 'Northern Districts Cricket Club Juniors'
  const SPONSOR = 'Harbourside Plumbing and Electrical Services'
  const PLAYER = 'Alexander Montgomery-Featherstonehaugh'
  const GRADE = 'Senior Men Division 2 North'
  const game = (i: number) => ({ gameId: `g${i}`, grade: GRADE, team: 'Test Club Division 2', round: 'Round 14', date: '2025-10-11', dateLabel: 'Sat 11 Oct', venue: 'Home Oval', opponent: OPP, letter: 'W', word: 'Won', clubScore: '182/6', oppScore: '158', clubShort: '182/6', oppShort: '158', margin: 'by 24 runs' })
  const data = async (): Promise<Partial<Record<GraphicType, unknown>>> => ({
    result: { mode: 'round', dateLabel: 'Sat 11 Oct', round: 'Round 14', games: [game(1), game(2), game(3)] } satisfies ResultData,
    'stats-leaders': { metric: 'Most runs', seasonLabel: '2025/26', scopeLabel: GRADE, rows: [1, 2, 3, 4, 5].map((n) => ({ rank: n, name: PLAYER, value: String(400 - n), context: '12 inns' })) } satisfies LeadersData,
    lineup: { grade: GRADE, round: 'Round 14', opponent: OPP, whenLabel: 'Sat 18 Oct, 1:00pm', venue: 'Home Oval', showOrder: true, updated: false, players: Array.from({ length: 11 }, (_, i) => ({ order: i + 1, name: PLAYER, captain: i === 0, keeper: i === 4 })) } satisfies LineupData,
    'sponsor-thanks': { sponsors: [{ name: SPONSOR, tier: 'Platinum', logo: await demoLogo(300, 120, '#336699') }, { name: SPONSOR.replace('Plumbing', 'Roofing'), tier: 'Gold', logo: null }], line: '' } satisfies SponsorThanksData,
  })

  it('every audited string fits at a readable size in every size and style without being cut', async () => {
    const fonts = await loadThemeFonts(theme)
    const all = await data()
    const cut: string[] = []
    let fitted = 0
    for (const type of Object.keys(all) as GraphicType[]) {
      for (const size of SIZE_KEYS) {
        for (const style of STYLE_KEYS) {
          const audit: { text: string; size: number; lines: number; truncated: boolean }[] = []
          const layout = SPECS[type].layout(all[type] as never, style, size)
          const el = renderGraphic({ layout, style, size, theme, crestDataUri: TINY_PNG, clubName: 'Test Club', siteHost: 'example.org', attribution: '', strip: [], audit })
          await new ImageResponse(el, { ...SIZES[size], fonts }).arrayBuffer()
          fitted += audit.length
          for (const a of audit) if (a.truncated || a.size < 16) cut.push(`${type} ${size} ${style}: "${a.text}" -> size ${a.size}${a.truncated ? ' (cut)' : ''}`)
        }
      }
    }
    expect(fitted).toBeGreaterThan(100)
    expect(cut).toEqual([])
  }, 240_000)
})
