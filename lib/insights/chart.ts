import { contrastRatio } from '@/lib/theme/contrast'

/**
 * Geometry for the trend chart (wave E, WP-3, spec 5.7). Pure: it turns labelled values into rectangles, points and label
 * positions, so the component is only markup and the numbers can be tested (no NaN, empty and single-point series).
 * Bars and a line share the y scale; a null is a gap, never zero.
 */
export type BarIn = { value: number; text: string; /** Drawn outlined, for example a not-out innings. */ hollow?: boolean }
export type TrendInput = {
  labels: readonly string[]
  bars?: readonly (BarIn | null)[]
  line?: readonly (number | null)[]
  lineText?: (v: number) => string
  /**
   * True only when dark label text on the accent bar fill meets the label contrast requirement (see `labelOnFillOk`).
   * The caller computes it once from the theme; when false (the default) no label is ever placed inside a bar.
   */
  insideOk?: boolean
}

/** A value label. `y` is the text baseline; `inside` means it sits inside its bar (dark text on the accent fill). */
export type ChartLabel = { id: string; x: number; y: number; text: string; anchor: 'middle'; kind: 'bar' | 'dot'; inside: boolean }

export type TrendGeometry = {
  width: number
  height: number
  baseline: number
  max: number
  bars: { x: number; y: number; w: number; h: number; text: string; hollow: boolean }[]
  segments: string[]
  dots: { x: number; y: number; text: string }[]
  /** Value labels that fit without overlapping each other; a label with no free place is left out (the table has it). */
  labels: ChartLabel[]
  xLabels: { x: number; text: string }[]
}

const HEIGHT = 170, TOP = 40, BOTTOM = 30, PAD = 10
export const SLOT = 34

/** Every bar is labelled when there are this many or fewer (seasons, a short run of innings). */
export const LABEL_ALL_MAX = 8
const CHAR_W = 5.8
const LABEL_H = 12
/** Vertical step between candidate positions: one label height plus a pixel. */
const STEP = LABEL_H + 1

type Box = { l: number; r: number; t: number; b: number }
/** The box a label occupies (text baseline `y`, centred on `x`). Shared by the placement and the tests. */
export function labelBox(l: { x: number; y: number; text: string }): Box {
  const w = l.text.length * CHAR_W + 4
  return { l: l.x - w / 2, r: l.x + w / 2, t: l.y - LABEL_H + 2, b: l.y + 2 }
}
export function boxesIntersect(a: Box, c: Box): boolean {
  return a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b
}

/** True when dark text on the accent fill meets `min` contrast (hex colours, `#RRGGBB`). */
export function labelOnFillOk(textHex: string, fillHex: string, min = 4.5): boolean {
  return contrastRatio(textHex, fillHex) >= min
}

export function buildTrend(input: TrendInput): TrendGeometry {
  const n = input.labels.length
  // A slot is wide enough for the longest label when every bar is labelled; with more bars labels are thinned instead.
  const labelW = Math.ceil(Math.max(0, ...input.labels.map((l) => l.length)) * CHAR_W) + 6
  const slot = n <= LABEL_ALL_MAX ? Math.max(SLOT, labelW) : SLOT
  const width = Math.max(320, n * slot + PAD * 2)
  const plotH = HEIGHT - TOP - BOTTOM
  const values = [...(input.bars ?? []).flatMap((b) => (b ? [b.value] : [])), ...(input.line ?? []).flatMap((v) => (v === null ? [] : [v]))].filter(Number.isFinite)
  const max = Math.max(1, ...values)
  const baseline = TOP + plotH
  const x = (i: number) => PAD + slot / 2 + i * slot
  const y = (v: number) => baseline - (Math.max(0, v) / max) * plotH
  const r = (v: number) => Math.round(v * 100) / 100

  const bars = (input.bars ?? []).flatMap((b, i) => (b && Number.isFinite(b.value) ? [{ x: r(x(i) - 10), y: r(y(b.value)), w: 20, h: r(Math.max(1, baseline - y(b.value))), text: b.text, hollow: !!b.hollow }] : []))

  const segments: string[] = []
  const dots: TrendGeometry['dots'] = []
  let run: string[] = []
  ;(input.line ?? []).forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (run.length) segments.push(run.join(' '))
      run = []
      return
    }
    run.push(`${r(x(i))},${r(y(v))}`)
    dots.push({ x: r(x(i)), y: r(y(v)), text: input.lineText ? input.lineText(v) : String(Math.round(v * 10) / 10) })
  })
  if (run.length) segments.push(run.join(' '))

  // Label every bar when there are few; otherwise about every labelW px so neighbours never overlap (first and last always).
  const step = n <= LABEL_ALL_MAX ? 1 : Math.max(1, Math.ceil(labelW / slot))
  const xLabels = input.labels.flatMap((text, i) => (i % step === 0 || i === n - 1 ? [{ x: r(x(i)), text }] : []))

  // Value labels. Priority: the last dot first, then bars left to right. Each tries above the mark, inside a bar (only when
  // insideOk) or below a dot, then further out; the first free spot inside the plot wins, otherwise the label is dropped.
  const placed: Box[] = []
  const labels: ChartLabel[] = []
  const inPlot = (b: Box) => b.l >= 0 && b.r <= width && b.t >= 0 && b.b <= baseline
  const place = (id: string, kind: 'bar' | 'dot', px: number, text: string, candidates: { y: number; inside: boolean }[]) => {
    for (const c of candidates) {
      const label: ChartLabel = { id, x: px, y: r(c.y), text, anchor: 'middle', kind, inside: c.inside }
      const box = labelBox(label)
      if (!inPlot(box) || placed.some((p) => boxesIntersect(p, box))) continue
      placed.push(box)
      labels.push(label)
      return
    }
  }
  const lastDot = dots[dots.length - 1]
  if (lastDot) {
    place('dot-last', 'dot', lastDot.x, lastDot.text, [8, 8 + 2 * STEP, 8 + 3 * STEP].map((d) => ({ y: lastDot.y - d, inside: false })).concat([{ y: lastDot.y + 14, inside: false }, { y: lastDot.y + 14 + STEP, inside: false }]))
  }
  for (const b of bars) {
    const cands: { y: number; inside: boolean }[] = [{ y: b.y - 4, inside: false }]
    if (input.insideOk && b.h >= LABEL_H + 4) cands.push({ y: b.y + LABEL_H, inside: true })
    cands.push({ y: b.y - 4 - STEP, inside: false }, { y: b.y - 4 - 2 * STEP, inside: false })
    place(`bar-${b.x}`, 'bar', r(b.x + b.w / 2), b.text, cands)
  }
  return { width, height: HEIGHT, baseline, max, bars, segments, dots, labels, xLabels }
}
