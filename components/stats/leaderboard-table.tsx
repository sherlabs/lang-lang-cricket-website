import Link from 'next/link'
import { Panel } from '@/components/playhq/player-stats-tables'
import { RankBadge } from '@/components/stats/rank-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { badgeFor } from '@/lib/stats/rank'

export type LeaderboardRow = { key: string | number; rank: number; name: string; slug: string; value: string; context: string }

/**
 * One ranked list in a `card-static` panel. The caption is screen-reader only and states the
 * scope and any qualification minimum; ties share a rank (competition ranking).
 */
export function LeaderboardTable({
  title,
  caption,
  valueLabel,
  contextLabel,
  rows,
  footer,
}: {
  title: string
  caption: string
  valueLabel: string
  contextLabel: string
  rows: LeaderboardRow[]
  footer?: React.ReactNode
}) {
  return (
    <Panel title={title}>
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow className="border-brand-black/10 hover:bg-transparent">
            <TableHead scope="col" className="w-12 text-brand-grey">Rank</TableHead>
            <TableHead scope="col" className="text-brand-grey">Player</TableHead>
            <TableHead scope="col" className="text-right tabular-nums text-brand-grey">{valueLabel}</TableHead>
            <TableHead scope="col" className="hidden text-right tabular-nums text-brand-grey sm:table-cell">{contextLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} className="border-brand-black/5 hover:bg-brand-stone/60">
              <TableCell><RankBadge rank={r.rank} badge={badgeFor(r.rank)} /></TableCell>
              <TableCell className="font-semibold text-brand-black">
                <Link href={`/players/${r.slug}`} className="hover:text-brand-gold-deep hover:underline">{r.name}</Link>
                {/* The context column is hidden on phones: show it under the name so the qualifier basis is not lost. */}
                <span className="block text-xs font-normal tabular-nums text-brand-grey sm:hidden">
                  <span className="sr-only">{contextLabel}: </span>{r.context}
                </span>
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-brand-black">{r.value}</TableCell>
              <TableCell className="hidden text-right tabular-nums text-brand-charcoal sm:table-cell">{r.context}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {footer}
    </Panel>
  )
}
