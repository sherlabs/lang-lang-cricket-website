import type { PositionSummary } from '@/lib/stats/match/position'

const BAR_W = 120, BAR_H = 10

const fmt = (v: number | null, dp = 1) => (v === null ? 'n/a' : v.toFixed(dp))

/** Batting position buckets (as scored): a table with a small inline SVG bar of runs per bucket. */
export function PositionTable({ summary, minInnings }: { summary: PositionSummary; minInnings: number }) {
  const maxRuns = Math.max(1, ...summary.lines.map((l) => l.runs))
  const lines = summary.lines.filter((l) => l.innings > 0)
  return (
    <div>
      <dl className="mb-3 flex flex-wrap gap-x-8 gap-y-1 text-sm text-brand-charcoal">
        {summary.mostCommon !== null && <div><dt className="inline text-brand-grey">Most common position (as scored): </dt><dd className="inline font-semibold tabular-nums">{summary.mostCommon}</dd></div>}
        {summary.averagePosition !== null && <div><dt className="inline text-brand-grey">Average position (as scored): </dt><dd className="inline font-semibold tabular-nums">{summary.averagePosition.toFixed(1)}</dd></div>}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Batting by position group, as scored. An average shows with at least {minInnings} innings.</caption>
          <thead>
            <tr className="border-b border-brand-black/10 text-brand-grey">
              <th scope="col" className="py-2 pr-3 font-semibold">Position group</th>
              <th scope="col" className="py-2 text-right font-semibold">Inns</th>
              <th scope="col" className="py-2 text-right font-semibold">Runs</th>
              <th scope="col" className="py-2 text-right font-semibold">Avg</th>
              <th scope="col" className="py-2 text-right font-semibold">NO</th>
              <th scope="col" className="py-2 text-right font-semibold">HS</th>
              <th scope="col" className="py-2 text-right font-semibold">50s</th>
              <th scope="col" className="py-2 pl-4 font-semibold"><span className="sr-only">Runs, as a bar</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-b border-brand-black/5">
                <th scope="row" className="py-2 pr-3 font-semibold text-brand-black">{l.label}</th>
                <td className="py-2 text-right tabular-nums">{l.innings}</td>
                <td className="py-2 text-right tabular-nums">{l.runs}</td>
                <td className="py-2 text-right tabular-nums">{fmt(l.average, 2)}</td>
                <td className="py-2 text-right tabular-nums">{l.notOuts}</td>
                <td className="py-2 text-right tabular-nums">{l.highScore}{l.highScoreNotOut ? '*' : ''}</td>
                <td className="py-2 text-right tabular-nums">{l.fifties}</td>
                <td className="py-2 pl-4">
                  <svg role="img" aria-label={`${l.runs} runs`} viewBox={`0 0 ${BAR_W} ${BAR_H}`} width={BAR_W} height={BAR_H} className="max-w-none">
                    <title>{`${l.label}: ${l.runs} runs`}</title>
                    <rect x={0} y={0} width={BAR_W} height={BAR_H} rx={2} className="fill-brand-stone" />
                    <rect x={0} y={0} width={Math.max(2, (l.runs / maxRuns) * BAR_W)} height={BAR_H} rx={2} className="fill-brand-gold" />
                  </svg>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
