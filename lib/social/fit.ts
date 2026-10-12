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

/** The metrics with row height and row text scaled (a rows block with room to spare, see `fillRowsScale`). */
export const scaleMetrics = (m: Metrics, scale: number | undefined): Metrics => (scale && scale !== 1 ? { ...m, row: Math.round(m.row * scale), rowText: Math.round(m.rowText * scale) } : m)

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
  while (logo > 36 && rows * cellHeight(logo, name, tier, opts.names, opts.tiers) > budget) logo -= 4
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

/** Name-only sponsors: a display-size name per line (one each for three or fewer), the tier under it. */
const NAME_GAP = 28
/** A wrapped name is cut at this share of the width, so two always sit side by side. */
export const NAME_CELL_MAX = 0.46
export const nameSize = (size: SizeKey): number => Math.round(METRICS[size].subhead * (size === 'landscape' ? 1.1 : 1.35))
export const nameTierSize = (size: SizeKey): number => Math.round(METRICS[size].body * 0.8)
/** One name cell: the name line, then the tier line when there is one. */
const nameCell = (i: { tier?: string }, size: SizeKey): number => Math.round(nameSize(size) * LINE) + (i.tier && !tierInline(size) ? Math.round(nameTierSize(size) * LINE) : 0) + 8
/** The wide page is short, so a sponsor's level sits beside its name instead of under it. */
export const tierInline = (size: SizeKey): boolean => size === 'landscape'
/** Whether the names go one per line (three or fewer) rather than in a wrapped line. */
export const namesStacked = (count: number): boolean => count <= 3
export function namesHeight(items: readonly { name: string; tier?: string }[], size: SizeKey): number {
  if (namesStacked(items.length)) return items.reduce((s, i) => s + nameCell(i, size), 0)
  const width = SIZES[size].width - 2 * METRICS[size].pad
  const tall = Math.max(...items.map((i) => nameCell(i, size)))
  // Greedy wrap by estimated width, as the renderer wraps its cells.
  let lineCount = 1
  let used = 0
  for (const i of items) {
    const w = Math.min(width * NAME_CELL_MAX, (i.name.length * nameSize(size) + (i.tier && tierInline(size) ? (i.tier.length + 2) * nameTierSize(size) : 0)) * GLYPH) + NAME_GAP
    if (used > 0 && used + w > width) { lineCount++; used = 0 }
    used += w
  }
  return lineCount * tall
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
      const rm = scaleMetrics(m, b.scale)
      const cols = Math.max(1, b.columns ?? 1)
      const per = Math.ceil(b.rows.length / cols) || 1
      let tallest = 0
      for (let i = 0; i < cols; i++) tallest = Math.max(tallest, b.rows.slice(i * per, (i + 1) * per).reduce((s, r) => s + rowHeight(r, rm), 0))
      return m.gap + (b.title ? Math.round(m.kicker * LINE) + 8 : 0) + tallest + (b.more > 0 ? rm.row : 0)
    }
    case 'photo':
      return m.gap + photoHeight(size, last)
    case 'logos':
      return 0 // sized to the space left, see `layoutHeight`
    case 'names':
      return m.gap + namesHeight(b.items, size)
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

/** The most a list's rows may be enlarged to use spare height, and the share of the page a filled list aims for. */
export const FILL_SCALE_CAP = 1.35
export const FILL_TARGET = 0.92

/**
 * The row scale that lets the (single) rows block of `blocks` use the page's spare height, never more than `cap`, never below 1.
 * Assumes the fullest footer (sponsor strip and site line), so it errs small. The row count never changes: only the size of each row.
 */
export function fillRowsScale(blocks: readonly Block[], size: SizeKey, style: StyleKey, cap = FILL_SCALE_CAP): number {
  const idx = blocks.findIndex((b) => b.kind === 'rows')
  if (idx < 0) return 1
  const m = METRICS[size]
  const rows = { ...(blocks[idx] as Extract<Block, { kind: 'rows' }>), scale: undefined }
  const others = blocks.reduce((sum, b, i, all) => (i === idx ? sum : sum + blockHeight(b, size, style, i === all.length - 1)), 0)
  const rowsPart = blockHeight(rows, size, style, idx === blocks.length - 1) - m.gap
  const target = availableHeight(size, style, footerHeight(size, { strip: true, text: true })) * FILL_TARGET
  const scale = (target - others - m.gap) / rowsPart
  return Math.max(1, Math.min(cap, Math.floor(scale * 100) / 100))
}
