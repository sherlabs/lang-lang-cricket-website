import type { ReactNode } from 'react'
import { movementText, type BoardRow } from '@/lib/votes/tally'

/**
 * The leaderboard as a real table (a caption, header cells with scope, the movement written as words, not just an arrow or a
 * colour). On a phone it scrolls sideways inside its container instead of shrinking. `breakdown` adds a column per place.
 */
export function LeaderboardTable({ rows, values, breakdown, caption, empty }: { rows: readonly BoardRow[]; values: readonly number[]; breakdown: boolean; caption: string; empty?: ReactNode }) {
  if (!rows.length) return <>{empty ?? <p className="rounded-xl bg-white p-5 text-sm text-brand-grey ring-1 ring-brand-black/10">No votes have been counted yet.</p>}</>
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-brand-black/10" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[22rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-brand-black/10 text-xs uppercase tracking-wide text-brand-grey">
          <tr>
            <th scope="col" className="px-3 py-2">Rank</th>
            <th scope="col" className="px-3 py-2">Player</th>
            <th scope="col" className="px-3 py-2 text-right">Points</th>
            {breakdown && values.map((v, i) => <th key={i} scope="col" className="px-3 py-2 text-right">{v} pt{v === 1 ? '' : 's'}</th>)}
            <th scope="col" className="px-3 py-2 text-right">Games</th>
            <th scope="col" className="px-3 py-2">Movement</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} className="border-b border-brand-black/5 last:border-0">
              <td className="px-3 py-2 font-semibold text-brand-black">{r.rank}{r.shared ? <span className="ml-1 text-xs font-normal text-brand-grey">(shared)</span> : null}</td>
              <td className="px-3 py-2 text-brand-black">{r.name}</td>
              <td className="px-3 py-2 text-right font-semibold text-brand-black">{r.points}</td>
              {breakdown && values.map((_, i) => <td key={i} className="px-3 py-2 text-right text-brand-grey">{r.counts[i] ?? 0}</td>)}
              <td className="px-3 py-2 text-right text-brand-grey">{r.games}</td>
              <td className="px-3 py-2 text-brand-grey">{movementText(r.movement)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
