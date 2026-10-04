/**
 * One horizontal stacked bar as server-rendered inline SVG. Segments use the brand tokens (fill
 * classes, never a literal colour). Colour never carries meaning alone: every segment is named in
 * the legend with its count, and the same numbers sit in a table inside `<details>`. The SVG has a
 * `<title>` and `<desc>`.
 */
export type ChartSegment = { key: string; label: string; count: number }

// Literal class names so Tailwind generates them. Swatches use the matching background class.
const TONES = [
  { fill: 'fill-brand-black', bg: 'bg-brand-black' },
  { fill: 'fill-brand-gold', bg: 'bg-brand-gold' },
  { fill: 'fill-brand-charcoal', bg: 'bg-brand-charcoal' },
  { fill: 'fill-brand-gold-dark', bg: 'bg-brand-gold-dark' },
  { fill: 'fill-brand-grey', bg: 'bg-brand-grey' },
  { fill: 'fill-brand-gold-light', bg: 'bg-brand-gold-light' },
  { fill: 'fill-brand-gold-deep', bg: 'bg-brand-gold-deep' },
  { fill: 'fill-brand-ink', bg: 'bg-brand-ink' },
  { fill: 'fill-brand-grey-light', bg: 'bg-brand-grey-light' },
] as const

const W = 600, H = 36

export function DismissalChart({ title, segments, idPrefix, unit = 'innings' }: { title: string; segments: ChartSegment[]; idPrefix: string; unit?: string }) {
  const total = segments.reduce((s, x) => s + x.count, 0)
  if (total === 0) return null
  const bars = segments.map((s, i) => {
    const before = segments.slice(0, i).reduce((n, x) => n + x.count, 0)
    return { ...s, x: (before / total) * W, w: (s.count / total) * W, tone: TONES[i % TONES.length] }
  })
  const desc = segments.map((s) => `${s.label}: ${s.count}`).join('. ')
  return (
    <figure className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
      <figcaption className="display text-lg text-brand-black">{title}</figcaption>
      <svg role="img" aria-labelledby={`${idPrefix}-t ${idPrefix}-d`} viewBox={`0 0 ${W} ${H}`} className="mt-3 h-9 w-full" preserveAspectRatio="none">
        <title id={`${idPrefix}-t`}>{title}</title>
        <desc id={`${idPrefix}-d`}>{desc}</desc>
        {bars.map((b) => (
          <rect key={b.key} x={b.x} y={0} width={Math.max(b.w - 1, 0)} height={H} className={b.tone.fill} />
        ))}
      </svg>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-brand-charcoal">
        {bars.map((b) => (
          <li key={b.key} className="flex items-center gap-2">
            <span aria-hidden className={`inline-block h-3 w-3 rounded-sm ${b.tone.bg}`} />
            <span>{b.label} <span className="tabular-nums text-brand-grey">{b.count}</span></span>
          </li>
        ))}
      </ul>
      <details className="mt-2 text-sm text-brand-grey">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-gold-deep">Show the numbers</summary>
        <table className="w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead><tr><th scope="col" className="py-1 pr-4 font-semibold">Type</th><th scope="col" className="py-1 text-right font-semibold">{unit}</th><th scope="col" className="py-1 text-right font-semibold">Share</th></tr></thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.key} className="border-t border-brand-black/5">
                <th scope="row" className="py-1 pr-4 font-normal">{s.label}</th>
                <td className="py-1 text-right tabular-nums">{s.count}</td>
                <td className="py-1 text-right tabular-nums">{Math.round((s.count / total) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
