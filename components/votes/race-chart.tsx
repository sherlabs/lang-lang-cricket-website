import type { RaceData } from '@/lib/votes/chart'

/** Fixed token cycles: colour is never the only signal, so every series also has its own dash pattern and marker shape. */
export const RACE_STROKES = ['stroke-brand-black', 'stroke-brand-gold-dark', 'stroke-brand-charcoal', 'stroke-brand-gold', 'stroke-brand-ink'] as const
export const RACE_FILLS = ['fill-brand-black', 'fill-brand-gold-dark', 'fill-brand-charcoal', 'fill-brand-gold', 'fill-brand-ink'] as const
export const RACE_DASHES = ['', '8 4', '2 4', '10 3 2 3', '5 5'] as const
export const RACE_MARKERS = ['circle', 'square', 'triangle', 'diamond', 'cross'] as const

const H = 220, TOP = 16, BOTTOM = 34, LEFT = 34, LABEL = 150, SLOT = 64

function Marker({ kind, x, y, fill, stroke }: { kind: (typeof RACE_MARKERS)[number]; x: number; y: number; fill: string; stroke: string }) {
  const r = 5
  switch (kind) {
    case 'circle':
      return <circle cx={x} cy={y} r={r} className={fill} />
    case 'square':
      return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} className={fill} />
    case 'triangle':
      return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} className={fill} />
    case 'diamond':
      return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} className={fill} />
    default:
      return <path d={`M${x - r},${y - r} L${x + r},${y + r} M${x + r},${y - r} L${x - r},${y + r}`} strokeWidth={2.5} fill="none" className={stroke} />
  }
}

/**
 * The race for the top five as server-rendered inline SVG: cumulative points after each closed round. Direct end-of-line labels
 * (name and points), distinct dashes and markers, a `<title>`/`<desc>` and the same numbers in a table inside `<details>`. It scrolls
 * sideways inside its box instead of shrinking at 360 px.
 */
export function RaceChart({ data, labels, idPrefix, caption }: { data: RaceData; labels: Record<string, string>; idPrefix: string; caption: string }) {
  if (!data.series.length || !data.rounds.length) return null
  const n = data.rounds.length
  const W = LEFT + Math.max(1, n - 1) * SLOT + SLOT / 2 + LABEL
  const plotH = H - TOP - BOTTOM
  const max = Math.max(1, ...data.series.flatMap((s) => s.points))
  const x = (i: number) => LEFT + i * SLOT
  const y = (v: number) => TOP + plotH - (v / max) * plotH
  // End labels, pushed apart so two leaders on the same total do not overprint.
  const ends = data.series.map((s, idx) => ({ idx, y: y(s.points[n - 1] ?? 0) })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14
  const labelY = new Map(ends.map((e) => [e.idx, e.y]))
  const titleId = `${idPrefix}-t`, descId = `${idPrefix}-d`
  const desc = data.series.map((s) => `${s.name} on ${s.points[n - 1]} points`).join('. ')
  return (
    <figure className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
      <figcaption className="display text-lg text-brand-black">{caption}</figcaption>
      <div className="mt-2 overflow-x-auto">
        <svg role="img" aria-labelledby={`${titleId} ${descId}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ minWidth: W, maxWidth: 'none' }} className="h-auto" preserveAspectRatio="xMinYMid meet">
          <title id={titleId}>{caption}</title>
          <desc id={descId}>{desc}</desc>
          <line x1={LEFT} x2={W - LABEL + 8} y1={TOP + plotH} y2={TOP + plotH} className="stroke-brand-black/15" strokeWidth={1} />
          <text x={4} y={TOP + 4} className="fill-brand-grey text-[10px]">{max}</text>
          <text x={4} y={TOP + plotH} className="fill-brand-grey text-[10px]">0</text>
          {data.rounds.map((r, i) => (
            <text key={r} x={x(i)} y={H - 12} textAnchor="middle" className="fill-brand-grey text-[10px]">{(labels[r] ?? r).replace(/^Weekend of /, '')}</text>
          ))}
          {data.series.map((s, idx) => {
            const k = idx % RACE_STROKES.length
            const pts = s.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')
            return (
              <g key={s.playerId}>
                <polyline points={pts} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={RACE_DASHES[k] || undefined} className={RACE_STROKES[k]} />
                {s.points.map((v, i) => (
                  <Marker key={i} kind={RACE_MARKERS[k]} x={x(i)} y={y(v)} fill={RACE_FILLS[k]} stroke={RACE_STROKES[k]} />
                ))}
                <text x={x(n - 1) + 12} y={(labelY.get(idx) ?? y(s.points[n - 1] ?? 0)) + 4} className="fill-brand-black text-[12px] font-semibold">{s.name} {s.points[n - 1]}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <details className="mt-2 text-sm text-brand-grey">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-gold-deep">Show the numbers</summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left">
            <caption className="sr-only">{caption}: points after each round</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-4 font-semibold">Player</th>
                {data.rounds.map((r) => <th key={r} scope="col" className="py-1 pr-3 text-right font-semibold">{(labels[r] ?? r).replace(/^Weekend of /, '')}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.series.map((s) => (
                <tr key={s.playerId} className="border-t border-brand-black/5">
                  <th scope="row" className="py-1 pr-4 font-normal">{s.name}</th>
                  {s.points.map((v, i) => <td key={i} className="py-1 pr-3 text-right tabular-nums">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
