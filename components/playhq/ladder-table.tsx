import type { Ladder } from '@/lib/playhq/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const COLUMNS: { key: string; label: string; format?: (v: number | string | null) => string }[] = [
  { key: 'played', label: 'P' },
  { key: 'won', label: 'W' },
  { key: 'lost', label: 'L' },
  { key: 'competitionPoints', label: 'PTS' },
  { key: 'quotient', label: 'Q', format: (v) => (typeof v === 'number' ? v.toFixed(3) : (v ?? '–').toString()) },
  { key: 'netRunRate', label: 'NRR', format: (v) => (typeof v === 'number' ? v.toFixed(3) : (v ?? '–').toString()) },
]

const num = 'tabular-nums text-right'

export function LadderTable({ ladder }: { ladder: Ladder }) {
  const keys = new Set(ladder.headers.map((h) => h.key))
  const cols = COLUMNS.filter((c) => keys.has(c.key))
  return (
    <div className="rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
      <Table>
        <TableHeader>
          <TableRow className="border-brand-black/10 hover:bg-transparent">
            <TableHead className={cn('w-12 text-brand-grey', num)}>Pos</TableHead>
            <TableHead className="text-brand-grey">Team</TableHead>
            {cols.map((c) => (
              <TableHead key={c.key} className={cn('text-brand-grey', num)}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ladder.rows.map((r) => (
            <TableRow
              key={r.teamId}
              className={cn('border-brand-black/5', r.isClub ? 'bg-brand-gold-pale font-semibold hover:bg-brand-gold-pale' : 'hover:bg-brand-stone/60')}
            >
              <TableCell className={cn('text-brand-grey', num)}>{r.position}</TableCell>
              <TableCell className="whitespace-normal text-brand-black">
                {r.teamName}
                {r.isClub && <span className="sr-only"> (Lang Lang)</span>}
              </TableCell>
              {cols.map((c) => (
                <TableCell key={c.key} className={cn('text-brand-charcoal', num)}>
                  {c.format ? c.format(r.values[c.key]) : (r.values[c.key] ?? '–')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
