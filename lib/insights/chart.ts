/**
 * Geometry for the trend chart (wave E, WP-3, spec 5.7). Pure: it turns labelled values into rectangles, points and label
 * positions, so the component is only markup and the numbers can be tested (no NaN, empty and single-point series).
 * Bars and a line share the y scale; a null is a gap, never zero.
 */
export type BarIn = { value: number; text: string; /** Drawn outlined, for example a not-out innings. */ hollow?: boolean }
export type TrendInput = { labels: readonly string[]; bars?: readonly (BarIn | null)[]; line?: readonly (number | null)[]; lineText?: (v: number) => string }

export type TrendGeometry = {
  width: number
  height: number
  baseline: number
  max: number
  bars: { x: number; y: number; w: number; h: number; tx: number; ty: number; text: string; hollow: boolean }[]
  segments: string[]
  dots: { x: number; y: number; text: string }[]
  xLabels: { x: number; text: string }[]
}

const HEIGHT = 170, TOP = 24, BOTTOM = 30, PAD = 10
export const SLOT = 34

export function buildTrend(input: TrendInput): TrendGeometry {
  const n = input.labels.length
  const width = Math.max(320, n * SLOT + PAD * 2)
  const plotH = HEIGHT - TOP - BOTTOM
  const values = [...(input.bars ?? []).flatMap((b) => (b ? [b.value] : [])), ...(input.line ?? []).flatMap((v) => (v === null ? [] : [v]))].filter(Number.isFinite)
  const max = Math.max(1, ...values)
  const baseline = TOP + plotH
  const x = (i: number) => PAD + SLOT / 2 + i * SLOT
  const y = (v: number) => baseline - (Math.max(0, v) / max) * plotH
  const r = (v: number) => Math.round(v * 100) / 100

  const bars = (input.bars ?? []).flatMap((b, i) => (b && Number.isFinite(b.value) ? [{ x: r(x(i) - 10), y: r(y(b.value)), w: 20, h: r(Math.max(1, baseline - y(b.value))), tx: r(x(i)), ty: r(y(b.value) - 4), text: b.text, hollow: !!b.hollow }] : []))

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

  // Show a label about every 40px so neighbours never overlap; always label the first and the last point.
  const step = Math.max(1, Math.ceil(40 / SLOT))
  const xLabels = input.labels.flatMap((text, i) => (i % step === 0 || i === n - 1 ? [{ x: r(x(i)), text }] : []))
  return { width, height: HEIGHT, baseline, max, bars, segments, dots, xLabels }
}
