import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { availableHeight, footerHeight } from '@/lib/social/fit'
import { METRICS } from '@/lib/social/density'
import { renderGraphic } from '@/lib/social/render'
import { styleTokens } from '@/lib/social/style'
import { SPECS } from '@/lib/social/specs'
import { SIZES, type GraphicType, type SizeKey, type StyleKey } from '@/lib/social/types'
import { loadThemeFonts } from '@/lib/theme/fonts-server'
import { resolveTheme } from '@/lib/theme/resolve'
import type { SponsorThanksData } from '@/lib/social/specs/sponsor-thanks'
import type { ResultData, ResultGame } from '@/lib/social/specs/result'
import type { LeadersData } from '@/lib/social/specs/stats-leaders'
import { TINY_PNG } from './social-fixtures'

/**
 * The measured layout metric (wave G spec WP-2b). A graphic is rendered through the real satori pipeline to PNG, then the content box
 * (everything between the masthead and the footer, headline included) is scanned for pixels that differ from the page background.
 * `unused` = 1 - (bounding box of those pixels) / (content box); the two gaps are the longest runs of empty rows / columns as a share.
 */
export type Measured = { unused: number; gapV: number; gapH: number }

const theme = resolveTheme(null)
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/** A logo-like PNG: wide, so layouts must contain it rather than assume a square. */
export async function demoLogo(w: number, h: number, color: string): Promise<string> {
  const [r, g, b] = hex(color)
  const buf = await sharp({ create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer()
  return `data:image/png;base64,${buf.toString('base64')}`
}

export function contentBox(size: SizeKey, style: StyleKey, footer: number): { top: number; height: number; left: number; width: number } {
  const m = METRICS[size]
  const avail = availableHeight(size, style, footer)
  const bottom = Math.round(m.pad * 0.7) + footer
  const top = SIZES[size].height - bottom - avail
  return { top, height: avail, left: m.pad, width: SIZES[size].width - 2 * m.pad }
}

export async function measure(data: unknown, type: GraphicType, size: SizeKey, style: StyleKey): Promise<Measured> {
  const fonts = await loadThemeFonts(theme)
  const layout = SPECS[type].layout(data as never, style, size)
  const strip = type === 'sponsor-thanks' ? [] : [{ src: TINY_PNG, name: 'S' }]
  const el = renderGraphic({ layout, style, size, theme, crestDataUri: TINY_PNG, clubName: 'Test Club', siteHost: 'example.org', attribution: '', strip })
  const png = Buffer.from(await new ImageResponse(el, { ...SIZES[size], fonts }).arrayBuffer())
  const { data: px, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const footer = footerHeight(size, { strip: !layout.noStrip && strip.length > 0, text: true })
  const box = contentBox(size, style, footer)
  const bg = hex(styleTokens(theme, style).surface)
  const at = (x: number, y: number) => (y * info.width + x) * 3
  const differs = (x: number, y: number) => {
    const i = at(x, y)
    return Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 30
  }
  const y0 = Math.max(0, box.top)
  const y1 = Math.min(info.height, box.top + box.height)
  const x0 = box.left
  const x1 = box.left + box.width
  let minX = x1, maxX = x0, minY = y1, maxY = y0
  const rowHas: boolean[] = []
  const colHas: boolean[] = new Array(x1 - x0).fill(false)
  for (let y = y0; y < y1; y++) {
    let any = false
    for (let x = x0; x < x1; x++) {
      if (differs(x, y)) {
        any = true
        colHas[x - x0] = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
    rowHas.push(any)
    if (any) { if (y < minY) minY = y; if (y > maxY) maxY = y }
  }
  const run = (flags: boolean[], from: number, to: number) => {
    let best = 0, cur = 0
    for (let i = from; i <= to; i++) { cur = flags[i] ? 0 : cur + 1; best = Math.max(best, cur) }
    return best
  }
  if (maxX < minX || maxY < minY) return { unused: 1, gapV: 1, gapH: 1 }
  const boxArea = box.width * (y1 - y0)
  const used = (maxX - minX + 1) * (maxY - minY + 1)
  // Gaps are measured inside the used bounding box in the empty-row direction, and across the whole box for columns' sake.
  return {
    unused: 1 - used / boxArea,
    gapV: run(rowHas, 0, rowHas.length - 1) / (y1 - y0),
    gapH: run(colHas, 0, colHas.length - 1) / box.width,
  }
}

const mk = (name: string, tier: string, logo: string | null) => ({ name, tier, logo })
export async function sponsorCase(n: number, withLogos = true): Promise<SponsorThanksData> {
  const wide = await demoLogo(400, 120, '#3a6ea5')
  const square = await demoLogo(200, 200, '#a53a3a')
  const tall = await demoLogo(120, 220, '#3aa56e')
  const logos = [wide, square, tall, wide]
  const names = ['Harbour Hardware', 'Corner Cafe and Catering Co', 'Plumbing Plus', 'Summit Financial Group']
  return { sponsors: Array.from({ length: n }, (_, i) => mk(names[i], ['Platinum', 'Gold', 'Silver', 'Bronze'][i], withLogos ? logos[i] : null)), line: '' }
}

/** Sponsors where only some (mixed) or none (all name-only) have a logo, for the centring and filling checks. */
export async function sponsorMixed(n: number, logos: number): Promise<SponsorThanksData> {
  const base = await sponsorCase(n)
  return { ...base, sponsors: base.sponsors.map((s, i) => (i < logos ? s : { ...s, logo: null })) }
}

const g = (i: number, over: Partial<ResultGame> = {}): ResultGame => ({
  gameId: `g${i}`, grade: `${i}. Grade ${i}`, team: 'Test Club', round: 'Round 4', date: '2025-10-11', dateLabel: 'Sat 11 Oct', venue: 'Home Oval', opponent: ['Rivals United', 'Northern Districts Cricket Club', 'Bay City', 'Hill Top'][i % 4],
  letter: i % 2 ? 'W' : 'L', word: i % 2 ? 'Won' : 'Lost', clubScore: '182/6', oppScore: '158', clubShort: '182/6', oppShort: '158', margin: 'by 24 runs', ...over,
})
export const resultRound = (n: number): ResultData => ({ mode: 'round', dateLabel: 'Sat 11 Oct', round: 'Round 4', games: Array.from({ length: n }, (_, i) => g(i + 1)) })
export const resultSingle = (): ResultData => ({ mode: 'single', game: g(1) })
export const leaders = (n: number): LeadersData => ({ metric: 'Most runs', seasonLabel: '2025/26', scopeLabel: 'Senior', rows: Array.from({ length: n }, (_, i) => ({ rank: i + 1, name: ['Alex Brown', 'Sam Carter', 'Jordan Lee', 'Taylor Nguyen', 'Chris Patel', 'Morgan Smith'][i], value: String(412 - i * 37), context: `${12 - i} inns` })) })

export type LayoutCase = { id: string; type: GraphicType; data: () => Promise<unknown> | unknown }
export const LAYOUT_CASES: LayoutCase[] = [
  ...[1, 2, 3, 4].map((n) => ({ id: `sponsor-thanks:${n}`, type: 'sponsor-thanks' as const, data: () => sponsorCase(n) })),
  ...[2, 3].map((n) => ({ id: `result-round:${n}`, type: 'result' as const, data: () => resultRound(n) })),
  { id: 'result-single', type: 'result' as const, data: () => resultSingle() },
  ...[3, 5].map((n) => ({ id: `stats-leaders:${n}`, type: 'stats-leaders' as const, data: () => leaders(n) })),
]
