import type { Series } from '@/lib/stats/progression'

const H = 150, TOP = 22, BOTTOM = 26, LEFT = 8, RIGHT = 8

/**
 * One progression series as server-rendered inline SVG. Colours come from the existing Tailwind
 * brand tokens (fill/stroke utilities), nothing is hard-coded. The SVG has a `<title>` and
 * `<desc>`; the same numbers sit in an adjacent table inside `<details>`, so the chart is never
 * the only way to read them.
 */
export function ProgressionChart({ series, idPrefix }: { series: Series; idPrefix: string }) {
  const points = series.points
  const n = points.length
  const slot = 56
  const W = Math.max(320, n * slot + LEFT + RIGHT)
  const plotH = H - TOP - BOTTOM
  const values = points.map((p) => p.value).filter((v): v is number => v !== null)
  const max = Math.max(...values, 1)
  const x = (i: number) => LEFT + slot / 2 + i * ((W - LEFT - RIGHT - slot) / Math.max(1, n - 1))
  const y = (v: number) => TOP + plotH - (v / max) * plotH
  const titleId = `${idPrefix}-t`, descId = `${idPrefix}-d`
  const desc = points.map((p) => `${p.label}: ${p.text}`).join('. ')
  const line = points.flatMap((p, i) => (p.value === null ? [] : [`${x(i)},${y(p.value)}`])).join(' ')

  return (
    <figure className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
      <figcaption className="display text-lg text-brand-black">{series.label}</figcaption>
      <svg role="img" aria-labelledby={`${titleId} ${descId}`} viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <title id={titleId}>{series.label}</title>
        <desc id={descId}>{desc}</desc>
        <line x1={LEFT} x2={W - RIGHT} y1={TOP + plotH} y2={TOP + plotH} className="stroke-brand-black/15" strokeWidth={1} />
        {series.kind === 'bar'
          ? points.map((p, i) =>
              p.value === null ? null : (
                <g key={p.seasonName}>
                  <rect x={x(i) - 16} y={y(p.value)} width={32} height={Math.max(1, TOP + plotH - y(p.value))} rx={3} className="fill-brand-gold" />
                  <text x={x(i)} y={y(p.value) - 5} textAnchor="middle" className="fill-brand-black text-[11px] font-semibold">{p.text}</text>
                </g>
              ),
            )
          : (
            <>
              <polyline points={line} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="stroke-brand-gold-deep" />
              {points.map((p, i) =>
                p.value === null ? null : (
                  <g key={p.seasonName}>
                    <circle cx={x(i)} cy={y(p.value)} r={4} className="fill-brand-black" />
                    <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" className="fill-brand-black text-[11px] font-semibold">{p.text}</text>
                  </g>
                ),
              )}
            </>
          )}
        {points.map((p, i) => (
          <text key={p.seasonName} x={x(i)} y={H - 8} textAnchor="middle" className="fill-brand-grey text-[10px]">{p.label}</text>
        ))}
      </svg>
      <details className="mt-2 text-sm text-brand-grey">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-gold-deep">Show the numbers</summary>
        <table className="w-full text-left">
          <caption className="sr-only">{series.label}</caption>
          <thead><tr><th scope="col" className="py-1 pr-4 font-semibold">Season</th><th scope="col" className="py-1 text-right font-semibold">Value</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.seasonName} className="border-t border-brand-black/5">
                <th scope="row" className="py-1 pr-4 font-normal">{p.label}</th>
                <td className="py-1 text-right tabular-nums">{p.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
