import { METRICS, type Metrics } from './density'
import { STYLE_KITS } from './kits'
import { BODY_FACE, BODY_REGULAR, DEFAULT_FACE, fitText, textWidth, type FaceKey, type FitResult } from './text-fit'
import { SIZES, type Block, type GraphicLayout, type Row, type SizeKey, type StyleKey } from './types'

/**
 * Height budgeting for the graphics. Satori cannot measure text, so a layout is checked against the page by this estimate instead:
 * every block has a known height rule (the renderer uses the same helpers below), and a layout whose blocks add up to more than the
 * space left under the masthead and above the footer does not fit. Tests run every type, size and style through it, so an overflow
 * shows up as a failing test rather than as a clipped picture.
 */

/** Line height used for text the renderer does not give an explicit one. */
const LINE = 1.25

/** A cover photo's height. One that is the whole story gets the room; one that shares the page with a list stays shorter. */
export function photoHeight(size: SizeKey, last: boolean): number {
  return last ? (size === 'story' ? 1150 : size === 'square' ? 560 : 330) : size === 'story' ? 760 : size === 'square' ? 340 : 230
}

/** The metrics with row height and row text scaled (a rows block with room to spare, see `fillRowsScale`). */
/** Row text grows no more than this, however tall the row gets, so a long name still fits across the page. */
const TEXT_SCALE_CAP = 1.6
export const scaleMetrics = (m: Metrics, scale: number | undefined): Metrics => (scale && scale !== 1 ? { ...m, row: Math.round(m.row * scale), rowText: Math.round(m.rowText * Math.min(scale, TEXT_SCALE_CAP)) } : m)

/** A list row that carries a second line (`detail`) under its main text. */
export const detailRowHeight = (m: Metrics): number => m.row + Math.round(m.rowText * 0.72 * LINE)
export const rowHeight = (r: Row, m: Metrics): number => (r.detail ? detailRowHeight(m) : m.row)

/** The width the content may use on a page. */
export const contentWidth = (size: SizeKey): number => SIZES[size].width - 2 * METRICS[size].pad

/**
 * How a group of sponsor logos is laid out (wave G spec WP-2b). The pattern is a table keyed by count and size: one logo is a hero,
 * two share a row (stacked on the tall page), three are one over two (square), across (wide) or stacked (tall), four are two by two
 * (across on the wide page).
 * Every logo sits `contain`ed in a paper tile; the whole group is centred in the space under the headline.
 */
export type LogoGrid = {
  /** Cells per row, top to bottom. */
  rows: number[]
  /** The widest row's cell count. */
  columns: number
  cellW: number
  tileW: number
  tileH: number
  name: number
  tier: number
  /** Name lines reserved under each tile (1 or 2). */
  nameLines: number
  gap: number
  /** Total height of the group. */
  height: number
}

const LOGO_TILE_PAD = 16
export const LOGO_TILE_INSET = LOGO_TILE_PAD
const LOGO_GAP = 24

export function logoPattern(count: number, size: SizeKey): number[] {
  if (count <= 1) return [1]
  if (count === 2) return size === 'story' ? [1, 1] : [2]
  if (count === 3) return size === 'square' ? [1, 2] : size === 'landscape' ? [3] : [1, 1, 1]
  // Four across on the wide page: two by two there leaves a quarter of the width empty (measured); square and tall use two by two.
  if (count === 4 && size === 'landscape') return [4]
  return [2, 2].concat(count > 4 ? [Math.min(2, count - 4)] : [])
}

/**
 * The grid for these sponsors in `budget` pixels of height. The tile fills what its cell offers (so a group never leaves a big empty
 * area), its height capped relative to its width so a tall cell does not make a tall, thin tile, and names are fitted under it.
 */
export function logoLayout(items: readonly { name: string; tier?: string }[], size: SizeKey, budget: number): LogoGrid {
  const m = METRICS[size]
  const count = Math.max(1, items.length)
  const rows = logoPattern(count, size)
  const columns = Math.max(...rows)
  const width = contentWidth(size)
  const cellW = Math.floor((width - LOGO_GAP * (columns - 1)) / columns)
  const hero = count === 1
  const name = hero ? m.subhead : Math.round(m.subhead * 0.85)
  const tier = Math.round(m.body * 0.8)
  const withNames = items.some((i) => i.name)
  const nameLines = withNames && items.some((i) => i.name && fitText(i.name, cellW, name, Math.round(name * 0.7), 2, BODY_FACE).lines.length > 1) ? 2 : 1
  const textH = (withNames ? Math.round(name * LINE) * nameLines + 6 : 0) + (items.some((i) => i.tier) ? Math.round(tier * LINE) : 0)
  const perRow = (budget - LOGO_GAP * (rows.length - 1)) / rows.length
  const tileH = Math.max(60, Math.min(Math.floor(perRow - textH), Math.round(cellW * (hero ? (size === 'story' ? 0.95 : 0.62) : size === 'story' ? 1 : 0.8))))
  const tileW = Math.min(cellW, Math.round(tileH * (hero ? (size === 'landscape' ? 3.8 : 3) : 2.8)))
  return { rows, columns, cellW, tileW, tileH, name, tier, nameLines, gap: LOGO_GAP, height: rows.length * (tileH + textH) + (rows.length - 1) * LOGO_GAP }
}

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
    const w = Math.min(width * NAME_CELL_MAX, textWidth(i.name, nameSize(size), DEFAULT_FACE) + (i.tier && tierInline(size) ? textWidth(`${i.tier}  `, nameTierSize(size), BODY_REGULAR) : 0)) + NAME_GAP
    if (used > 0 && used + w > width) { lineCount++; used = 0 }
    used += w
  }
  return lineCount * tall
}

/** Vertical padding of each side of a score line: roomier on the tall page, where a single result would otherwise float in empty space. */
export const versusPad = (m: Metrics, size: SizeKey): number => (size === 'story' ? Math.round(m.gap * 1.3) : Math.round(m.gap / 2))

/** A headline fitted to the page: the largest size down to 42 percent of the base, at most two lines, never clipped. */
export function headlineFit(text: string, size: SizeKey, style: StyleKey, face: FaceKey = DEFAULT_FACE, base = METRICS[size].headline): FitResult {
  const t = STYLE_KITS[style].headlineUpper ? text.toUpperCase() : text
  return fitText(t, contentWidth(size), base, Math.round(base * 0.42), 2, face)
}

/** Running text (subhead, text blocks) fitted to the page width, down to 70 percent of its size, at most `max` lines. */
export function textFit(text: string, size: SizeKey, base: number, max: number, face: FaceKey = BODY_FACE): FitResult {
  return fitText(text, contentWidth(size), base, Math.round(base * 0.7), max, face)
}

function blockHeight(b: Block, size: SizeKey, style: StyleKey, last: boolean): number {
  const m = METRICS[size]
  const kit = STYLE_KITS[style]
  switch (b.kind) {
    case 'kicker':
      return m.gap + Math.round(m.kicker * LINE)
    case 'headline': {
      const f = headlineFit(b.text, size, style)
      return Math.round(m.gap / 2) + Math.round(f.size * 1.05) * f.lines.length + (kit.headlineRule ? 24 : 0)
    }
    case 'subhead': {
      const f = textFit(b.text, size, m.subhead, 2)
      return Math.round(m.gap / 2) + Math.round(f.size * LINE) * f.lines.length
    }
    case 'text': {
      const f = textFit(b.text, size, m.body, 3)
      return m.gap + Math.round(f.size * LINE) * f.lines.length
    }
    case 'versus':
      return m.gap + 2 * (2 * versusPad(m, size) + Math.max(m.score, m.subhead)) + (b.note ? Math.round(m.gap / 2) + Math.round(m.subhead * LINE) : 0)
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
  return logoLayout(logos.items, size, Math.max(0, available - others - LOGOS_GAP(METRICS[size])))
}

/** Height the layout's blocks need on a page with `available` pixels for them. An empty layout is one line of text. */
export function layoutHeight(layout: GraphicLayout, size: SizeKey, style: StyleKey, available: number): number {
  const m = METRICS[size]
  if (layout.empty) return m.gap + Math.round(m.subhead * LINE)
  const grid = logosFor(layout, size, style, available)
  const others = layout.blocks.reduce((sum, b, i, all) => sum + blockHeight(b, size, style, i === all.length - 1), 0)
  return others + (grid ? LOGOS_GAP(m) + grid.height : 0)
}

/** The most a list's rows may be enlarged to use spare height, and the share of the page a filled list aims for. */
export const FILL_SCALE_CAP = 4
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

/** The blocks with the (single) rows block enlarged to use spare page height; unchanged when there is none. */
export function fillRows(blocks: Block[], size: SizeKey, style: StyleKey): Block[] {
  const scale = fillRowsScale(blocks, size, style)
  return scale > 1 ? blocks.map((b) => (b.kind === 'rows' ? { ...b, scale } : b)) : blocks
}

/**
 * A cheap estimate of the share of the content box a layout leaves empty, used at layout time to choose between candidate layouts
 * (a larger scale, a different grid) without rendering. The renderer keeps the headline at the top and centres everything under it,
 * so the picture's ink ends half the free height above the bottom of the box; that gap, over the box height, times the share of the
 * width the widest logo row covers (the only block narrower than the page), is the estimate. `tests/social-layout.test.ts`
 * calibrates it against the pixel metric of real renders and fails if it drifts by more than five percentage points.
 */
export function emptyShare(layout: GraphicLayout, size: SizeKey, style: StyleKey): number {
  const avail = availableHeight(size, style, footerHeight(size, { strip: !layout.noStrip, text: true }))
  const used = Math.min(avail, layoutHeight(layout, size, style, avail))
  const grid = logosFor(layout, size, style, avail)
  const widthShare = grid ? Math.min(1, (grid.columns * grid.tileW + (grid.columns - 1) * grid.gap) / contentWidth(size)) : 1
  const heightShare = 1 - (avail - used) / 2 / avail
  return Math.max(0, 1 - heightShare * widthShare)
}
