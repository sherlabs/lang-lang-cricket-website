import { headlineSize, METRICS, type Metrics } from './density'
import { STYLE_KITS } from './kits'
import { SIZES, type Block, type GraphicLayout, type Row, type SizeKey, type StyleKey } from './types'

/**
 * Height budgeting for the graphics. Satori cannot measure text, so a layout is checked against the page by this estimate instead:
 * every block has a known height rule (the renderer uses the same helpers below), and a layout whose blocks add up to more than the
 * space left under the masthead and above the footer does not fit. Tests run every type, size and style through it, so an overflow
 * shows up as a failing test rather than as a clipped picture.
 */

/** Line height used for text the renderer does not give an explicit one. */
const LINE = 1.25
/** Average glyph width as a share of the font size, for deciding how many lines a text wraps to. Generous on purpose. */
const GLYPH = 0.58

/** A cover photo's height. One that is the whole story gets the room; one that shares the page with a list stays shorter. */
export function photoHeight(size: SizeKey, last: boolean): number {
  return last ? (size === 'story' ? 1150 : size === 'square' ? 560 : 330) : size === 'story' ? 760 : size === 'square' ? 340 : 230
}

/** A list row that carries a second line (`detail`) under its main text. */
export const detailRowHeight = (m: Metrics): number => m.row + Math.round(m.rowText * 0.72 * LINE)
export const rowHeight = (r: Row, m: Metrics): number => (r.detail ? detailRowHeight(m) : m.row)

/** How a row of sponsor logos is laid out for a given count: columns, logo height, and the text sizes under each logo. */
export type LogoGrid = { columns: number; logo: number; name: number; tier: number; cell: number }

const LOGO_TILE_PAD = 12
const LOGO_CELL_GAP = 14

/** One logo cell: tile (logo plus its padding), name line, tier line, gap. */
function cellHeight(logo: number, name: number, tier: number, hasName: boolean, hasTier: boolean): number {
  return logo + 2 * LOGO_TILE_PAD + (hasName ? Math.round(name * LINE) + 6 : 0) + (hasTier ? Math.round(tier * LINE) : 0) + LOGO_CELL_GAP
}

/**
 * The logo grid for `count` sponsors. One sponsor is drawn large; two share a row; three or four wrap to two columns (square, story)
 * or a single row (wide, where height is the scarce thing). Logo height shrinks as the grid gets denser so the whole grid stays
 * inside `budget` (pixels of height it may use), down to a floor.
 */
export function logoGrid(count: number, size: SizeKey, budget: number, opts: { names: boolean; tiers: boolean }): LogoGrid {
  const m = METRICS[size]
  const columns = count <= 1 ? 1 : size === 'landscape' ? Math.min(count, 4) : 2
  const rows = Math.ceil(Math.max(1, count) / columns)
  const name = count <= 1 ? m.subhead : Math.round(m.subhead * 0.85)
  const tier = Math.round(m.body * 0.8)
  const top = count <= 1 ? (size === 'landscape' ? 150 : 260) : size === 'landscape' ? 96 : size === 'story' ? 200 : 170
  let logo = top
  while (logo > 44 && rows * cellHeight(logo, name, tier, opts.names, opts.tiers) > budget) logo -= 4
  return { columns, logo, name, tier, cell: cellHeight(logo, name, tier, opts.names, opts.tiers) }
}

/** Estimated lines of `text` at `fs` px in `width` px, never fewer than one. */
const lines = (text: string, fs: number, width: number): number => Math.max(1, Math.ceil((text.length * fs * GLYPH) / width))

/** The space (px of height) a layout's blocks may use on this page: the page less frame, masthead, paddings and footer. */
export function availableHeight(size: SizeKey, style: StyleKey, footerHeight: number): number {
  const m = METRICS[size]
  const kit = STYLE_KITS[style]
  const band = kit.frame === 'band'
  let h = SIZES[size].height
  if (kit.frame === 'bar') h -= 14
  const crest = kit.masthead === 'corner' ? Math.round(m.crest * 0.7) : m.crest
  const mast = Math.max(crest + (style === 'bold' ? 2 * Math.round(crest / 9) : 0), Math.round(m.club * LINE))
  if (band) h -= 2 * Math.round(m.pad / 2.4) + Math.max(m.crest + 2 * Math.round(m.crest / 9), Math.round(m.club * LINE)) + 8
  else h -= mast
  h -= Math.round(m.pad * (band ? 0.5 : 0.7)) + Math.round(m.pad * 0.7)
  return h - footerHeight
}

/** The footer's height: the sponsor strip and the site line, each only when drawn. */
export function footerHeight(size: SizeKey, opts: { strip: boolean; text: boolean }): number {
  const m = METRICS[size]
  if (!opts.strip && !opts.text) return 0
  return m.gap + (opts.strip ? m.logo + 16 : 0) + (opts.text ? Math.round(m.footer * LINE) + (opts.strip ? 10 : 0) : 0)
}

function blockHeight(b: Block, size: SizeKey, style: StyleKey, last: boolean): number {
  const m = METRICS[size]
  const kit = STYLE_KITS[style]
  const width = SIZES[size].width - 2 * m.pad
  switch (b.kind) {
    case 'kicker':
      return m.gap + Math.round(m.kicker * LINE)
    case 'headline': {
      const text = kit.headlineUpper ? b.text.toUpperCase() : b.text
      const fs = headlineSize(text, m.headline)
      const n = Math.min(3, lines(text, fs, width))
      return Math.round(m.gap / 2) + Math.round(fs * 1.05) * n + (kit.headlineRule ? 24 : 0)
    }
    case 'subhead':
      return Math.round(m.gap / 2) + Math.round(m.subhead * LINE) * Math.min(3, lines(b.text, m.subhead, width))
    case 'text':
      return m.gap + Math.round(m.body * LINE) * Math.min(5, lines(b.text, m.body, width))
    case 'versus':
      return m.gap + 2 * (m.gap + Math.max(m.score, m.subhead)) + (b.note ? Math.round(m.gap / 2) + Math.round(m.subhead * LINE) : 0)
    case 'bigNumber':
      return m.gap + m.bigNumber + (b.label ? Math.round(m.subhead * LINE) : 0)
    case 'rows': {
      const cols = Math.max(1, b.columns ?? 1)
      const per = Math.ceil(b.rows.length / cols) || 1
      let tallest = 0
      for (let i = 0; i < cols; i++) tallest = Math.max(tallest, b.rows.slice(i * per, (i + 1) * per).reduce((s, r) => s + rowHeight(r, m), 0))
      return m.gap + (b.title ? Math.round(m.kicker * LINE) + 8 : 0) + tallest + (b.more > 0 ? m.row : 0)
    }
    case 'photo':
      return m.gap + photoHeight(size, last)
    case 'logos':
      return 0 // sized to the space left, see `layoutHeight`
  }
}

const LOGOS_GAP = (m: Metrics): number => m.gap

/** The logo grid for the layout's logos block (if any), sized to what the other blocks leave of `available`. */
export function logosFor(layout: GraphicLayout, size: SizeKey, style: StyleKey, available: number): LogoGrid | null {
  const idx = layout.blocks.findIndex((b) => b.kind === 'logos')
  if (idx < 0) return null
  const logos = layout.blocks[idx] as Extract<Block, { kind: 'logos' }>
  const others = layout.blocks.reduce((sum, b, i, all) => (i === idx ? sum : sum + blockHeight(b, size, style, i === all.length - 1)), 0)
  return logoGrid(logos.items.length, size, Math.max(0, available - others - LOGOS_GAP(METRICS[size])), { names: logos.items.some((i) => i.name), tiers: logos.items.some((i) => i.tier) })
}

/** Height the layout's blocks need on a page with `available` pixels for them. An empty layout is one line of text. */
export function layoutHeight(layout: GraphicLayout, size: SizeKey, style: StyleKey, available: number): number {
  const m = METRICS[size]
  if (layout.empty) return m.gap + Math.round(m.subhead * LINE)
  const grid = logosFor(layout, size, style, available)
  const others = layout.blocks.reduce((sum, b, i, all) => sum + blockHeight(b, size, style, i === all.length - 1), 0)
  return others + (grid ? LOGOS_GAP(m) + grid.cell * Math.ceil(layout.blocks.filter((b): b is Extract<Block, { kind: 'logos' }> => b.kind === 'logos').reduce((n, b) => n + b.items.length, 0) / grid.columns) : 0)
}
