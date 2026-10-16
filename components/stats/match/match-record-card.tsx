import Link from 'next/link'
import { Panel } from '@/components/playhq/player-stats-tables'
import { RankBadge } from '@/components/stats/rank-badge'
import { formatCoverageDate } from '@/lib/stats/match/coverage'
import type { MatchRecordList } from '@/lib/stats/match/records'
import { badgeFor } from '@/lib/stats/rank'

/** One record list from the stored matches. `detail` carries date, opposition and grade (never an opposition person). */
export function MatchRecordCard({ record, players }: { record: MatchRecordList; players: ReadonlyMap<number, { name: string; slug: string }> }) {
  return (
    <Panel title={record.title}>
      {record.entries.length === 0 ? (
        <p className="px-3 py-4 text-sm text-brand-grey-light">Nothing recorded yet.</p>
      ) : (
        <ol className="divide-y divide-brand-black/5">
          {record.entries.map((e, i) => {
            const p = e.playerId === null ? null : players.get(e.playerId)
            if (e.playerId !== null && !p) return null
            const [date, ...rest] = e.detail?.split(' · ') ?? []
            const detail = [date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatCoverageDate(date) : date, ...rest].filter(Boolean).join(' · ')
            return (
              <li key={`${e.playerId ?? 'club'}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
                <RankBadge rank={e.rank} badge={badgeFor(e.rank)} />
                <div className="min-w-0 flex-1">
                  {p ? <Link href={`/players/${p.slug}`} className="font-semibold text-brand-black hover:text-brand-gold-deep hover:underline">{p.name}</Link> : <span className="font-semibold text-brand-black">Club</span>}
                  {detail && <p className="truncate text-xs text-brand-grey">{detail}</p>}
                </div>
                <span className="display text-2xl tabular-nums text-brand-black">{e.display}</span>
              </li>
            )
          })}
        </ol>
      )}
      {record.moreTied > 0 && <p className="px-3 pb-3 text-sm text-brand-grey">+{record.moreTied} more tied</p>}
    </Panel>
  )
}
