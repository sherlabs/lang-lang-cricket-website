import { buildTrend, type TrendInput } from '@/lib/insights/chart'

/**
 * A bars-and-line trend as server-rendered inline SVG (wave E, WP-3). Colours are Tailwind brand utilities written out in
 * full, axes use the text colour, and nothing is a hex value. The SVG carries a title and a description that states the
 * takeaway; the same numbers sit in a table inside `details`, so the chart is never the only way to read them. Value labels are placed by the geometry so none overlap; one with no free place is left out and stays in the table. A hollow bar
 * (for example a not-out innings) also carries a star in its label: colour never carries meaning alone.
 */
export function TrendChart({
  idPrefix, title, takeaway, input, legend, tableHead, tableRows,
}: {
  idPrefix: string
  title: string
  /** One or two sentences with the number the chart shows. */
  takeaway: string
  input: TrendInput
  /** What the bars and the line mean, in words. */
  legend: string
  tableHead: readonly string[]
  tableRows: readonly (readonly string[])[]
}) {
  const g = buildTrend(input)
  const titleId = `${idPrefix}-t`, descId = `${idPrefix}-d`
  return (
    <figure className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
      <figcaption className="display text-lg text-brand-black">{title}</figcaption>
      <p className="mt-1 text-sm text-brand-grey">{legend}</p>
      {/* Scrolls sideways inside its own box rather than shrinking the labels below legibility. */}
      <div className="mt-2 overflow-x-auto" role="group" tabIndex={0} aria-label={`${title}, scrolls sideways`}>
        <svg role="img" aria-labelledby={`${titleId} ${descId}`} viewBox={`0 0 ${g.width} ${g.height}`} width={g.width} height={g.height} style={{ minWidth: g.width, maxWidth: 'none' }} className="h-auto w-full text-brand-grey" preserveAspectRatio="xMidYMid meet">
          <title id={titleId}>{title}</title>
          <desc id={descId}>{takeaway}</desc>
          <line x1={0} x2={g.width} y1={g.baseline} y2={g.baseline} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} />
          {g.bars.map((b) => (
            <g key={`${b.x}`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} strokeWidth={b.hollow ? 2 : 0} className={b.hollow ? 'fill-transparent stroke-brand-gold-deep' : 'fill-brand-gold'} />
            </g>
          ))}
          {g.segments.map((pts) => (
            <polyline key={pts} points={pts} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="stroke-brand-black" />
          ))}
          {g.dots.map((d) => (
            <circle key={`${d.x}`} cx={d.x} cy={d.y} r={3} className="fill-brand-black" />
          ))}
          {g.labels.map((l) => (
            <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} className="fill-brand-black text-[10px] font-semibold">{l.text}</text>
          ))}
          {g.xLabels.map((l) => (
            <text key={`${l.x}`} x={l.x} y={g.height - 10} textAnchor="middle" className="fill-brand-grey text-[10px]">{l.text}</text>
          ))}
        </svg>
      </div>
      <details className="mt-2 text-sm text-brand-grey">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-gold-deep">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>{tableHead.map((h, i) => <th key={h} scope="col" className={i === 0 ? 'py-1 pr-4 font-semibold' : 'py-1 pl-3 text-right font-semibold'}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {tableRows.map((r, ri) => (
                <tr key={`${ri}-${r[0]}`} className="border-t border-brand-black/5">
                  {r.map((c, i) => (i === 0 ? <th key={i} scope="row" className="py-1 pr-4 font-normal">{c}</th> : <td key={i} className="py-1 pl-3 text-right tabular-nums">{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
