import { formatCoverageDate } from '@/lib/stats/match/coverage'
import type { GradeProgression, ProgressionCell, ResultLetter } from '@/lib/stats/match/yearbook'

const SLOT = 44, LEFT = 10, RIGHT = 10, STRIP_TOP = 8, CELL = 28, GAP = 14, PLOT_H = 86, BOTTOM = 20

const CELL_CLASS: Record<ResultLetter, { rect: string; text: string }> = {
  W: { rect: 'fill-brand-gold', text: 'fill-brand-black' },
  L: { rect: 'fill-brand-black', text: 'fill-white' },
  D: { rect: 'fill-brand-stone', text: 'fill-brand-charcoal' },
  T: { rect: 'fill-brand-stone', text: 'fill-brand-charcoal' },
  N: { rect: 'fill-brand-stone', text: 'fill-brand-charcoal' },
}

/** Text alternative of a series: one sentence per game. */
export function winLossDescription(p: GradeProgression): string {
  return p.cells.map((c, i) => `Game ${i + 1}${c.date ? ` on ${formatCoverageDate(c.date)}` : ''} against ${c.opponent}: ${c.word}. Wins minus losses ${c.net}.`).join(' ')
}

/**
 * Win/loss progression for one grade as server-rendered inline SVG (W2 spec 5.5): a result strip with a
 * letter per game (W L D T N, never colour alone) above a stepped line of cumulative wins minus losses.
 * Colours are Tailwind brand classes. The same figures sit in a table inside `<details>`.
 */
export function WinLossChart({ progression, idPrefix }: { progression: GradeProgression; idPrefix: string }) {
  const cells: ProgressionCell[] = progression.cells
  const n = cells.length
  if (n === 0) return null
  const W = Math.max(320, n * SLOT + LEFT + RIGHT)
  const nets = [0, ...cells.map((c) => c.net)]
  const hi = Math.max(...nets, 1), lo = Math.min(...nets, -1)
  const plotTop = STRIP_TOP + CELL + GAP
  const H = plotTop + PLOT_H + BOTTOM
  const y = (v: number) => plotTop + ((hi - v) / (hi - lo)) * PLOT_H
  const cx = (i: number) => LEFT + SLOT * (i + 0.5)
  let path = `M ${LEFT} ${y(0)}`
  let prev = 0
  cells.forEach((c, i) => {
    path += ` L ${cx(i)} ${y(prev)} L ${cx(i)} ${y(c.net)}`
    prev = c.net
  })
  path += ` L ${LEFT + n * SLOT} ${y(prev)}`
  const titleId = `${idPrefix}-t`, descId = `${idPrefix}-d`
  const title = `${progression.grade}: win and loss progression`
  const last = cells[n - 1]

  return (
    <figure className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
      <figcaption className="display text-lg text-brand-black">{progression.grade}</figcaption>
      <p className="text-sm text-brand-grey">{n} {n === 1 ? 'game' : 'games'}, {last.wins} won, {last.losses} lost. The line is wins minus losses after each game.</p>
      <div className="mt-2 overflow-x-auto">
        <svg role="img" aria-labelledby={`${titleId} ${descId}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ minWidth: W, maxWidth: 'none' }} className="h-auto w-full">
          <title id={titleId}>{title}</title>
          <desc id={descId}>{winLossDescription(progression)}</desc>
          {cells.map((c, i) => (
            <g key={c.gameId}>
              <rect x={cx(i) - CELL / 2} y={STRIP_TOP} width={CELL} height={CELL} rx={4} className={CELL_CLASS[c.letter].rect} />
              <text x={cx(i)} y={STRIP_TOP + CELL / 2 + 5} textAnchor="middle" className={`${CELL_CLASS[c.letter].text} text-[13px] font-bold`}>{c.letter}</text>
              {c.forfeit && <text x={cx(i) + CELL / 2 - 1} y={STRIP_TOP + 9} textAnchor="end" className={`${CELL_CLASS[c.letter].text} text-[9px] font-bold`}>f</text>}
            </g>
          ))}
          <line x1={LEFT} x2={W - RIGHT} y1={y(0)} y2={y(0)} className="stroke-brand-black/20" strokeWidth={1} strokeDasharray="3 3" />
          <text x={LEFT} y={y(0) - 4} className="fill-brand-grey text-[10px]">0</text>
          <path d={path} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-brand-gold-deep" />
          {cells.map((c, i) => (
            <g key={`${c.gameId}-p`}>
              <circle cx={cx(i)} cy={y(c.net)} r={3.5} className="fill-brand-black" />
              <text x={cx(i)} y={H - 6} textAnchor="middle" className="fill-brand-grey text-[10px]">{c.net > 0 ? `+${c.net}` : c.net}</text>
            </g>
          ))}
        </svg>
      </div>
      <details className="mt-2 text-sm text-brand-grey">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-gold-deep">Show the numbers</summary>
        <table className="w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-3 font-semibold">Date</th>
              <th scope="col" className="py-1 pr-3 font-semibold">Opposition</th>
              <th scope="col" className="py-1 pr-3 font-semibold">Result</th>
              <th scope="col" className="py-1 text-right font-semibold">Wins minus losses</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={c.gameId} className="border-t border-brand-black/5">
                <td className="py-1 pr-3">{c.date ? formatCoverageDate(c.date) : '–'}</td>
                <td className="py-1 pr-3">{c.opponent}</td>
                <td className="py-1 pr-3">{c.letter}<span className="sr-only"> ({c.word})</span> <span aria-hidden>{c.word}</span></td>
                <td className="py-1 text-right tabular-nums">{c.net}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
