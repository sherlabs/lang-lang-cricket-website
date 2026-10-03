import { Panel } from '@/components/playhq/player-stats-tables'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SeasonCounts } from '@/lib/players/season-math'
import type { CompareRow, SeasonSplitRow } from '@/lib/stats/compare'
import { getMetric } from '@/lib/stats/metrics'
import { cn } from '@/lib/utils'

const num = 'tabular-nums text-right'
const head = 'text-brand-grey'

function Cell({ value, better }: { value: string; better: boolean }) {
  return (
    <TableCell className={cn(num, better ? 'bg-brand-gold-pale font-bold text-brand-gold-deep' : 'text-brand-charcoal')}>
      {better && <span aria-hidden className="mr-1">✓</span>}
      {value}
      {better && <span className="sr-only"> (better)</span>}
    </TableCell>
  )
}

/** Head-to-head: one row per metric; the better value gets a tint plus a tick so colour is not the only cue. */
export function CompareTable({ rows, nameA, nameB, caption }: { rows: CompareRow[]; nameA: string; nameB: string; caption: string }) {
  const groups = [
    { id: 'batting', title: 'Batting' },
    { id: 'bowling', title: 'Bowling' },
    { id: 'fielding', title: 'Fielding & games' },
  ] as const
  const groupOf = (r: CompareRow) => (r.group === 'batting' ? 'batting' : r.group === 'bowling' ? 'bowling' : 'fielding')
  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const list = rows.filter((r) => groupOf(r) === g.id)
        if (list.length === 0) return null
        return (
          <Panel key={g.id} title={g.title}>
            <Table>
              <caption className="sr-only">{g.title}: {caption}</caption>
              <TableHeader>
                <TableRow className="border-brand-black/10 hover:bg-transparent">
                  <TableHead scope="col" className={head}>Stat</TableHead>
                  <TableHead scope="col" className={cn(head, num)}>{nameA}</TableHead>
                  <TableHead scope="col" className={cn(head, num)}>{nameB}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.key} className="border-brand-black/5 hover:bg-brand-stone/60">
                    <TableCell className="font-semibold text-brand-black">{r.label}</TableCell>
                    <Cell value={r.a} better={r.better === 'a'} />
                    <Cell value={r.b} better={r.better === 'b'} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        )
      })}
    </div>
  )
}

const SPLIT = ['runs', 'avg', 'wickets', 'games'] as const
const fmt = (c: SeasonCounts | null, key: string) => (c ? getMetric(key)!.format(c) : '–')

/** Season-by-season on a shared axis; a player who did not play that season shows dashes. */
export function SeasonSplitTable({ rows, nameA, nameB }: { rows: SeasonSplitRow[]; nameA: string; nameB: string }) {
  if (rows.length === 0) return null
  return (
    <Panel title="Season by season">
      <Table>
        <caption className="sr-only">Runs, batting average, wickets and games by season for {nameA} and {nameB}</caption>
        <TableHeader>
          <TableRow className="border-brand-black/10 hover:bg-transparent">
            <TableHead scope="col" rowSpan={2} className={head}>Season</TableHead>
            <TableHead scope="colgroup" colSpan={SPLIT.length} className={cn(head, 'text-center')}>{nameA}</TableHead>
            <TableHead scope="colgroup" colSpan={SPLIT.length} className={cn(head, 'text-center')}>{nameB}</TableHead>
          </TableRow>
          <TableRow className="border-brand-black/10 hover:bg-transparent">
            {[0, 1].flatMap((p) => SPLIT.map((k) => (
              <TableHead key={`${p}-${k}`} scope="col" className={cn(head, num)}>{getMetric(k)!.short}</TableHead>
            )))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.seasonName} className="border-brand-black/5 hover:bg-brand-stone/60">
              <TableCell className="font-semibold text-brand-black">{r.label}</TableCell>
              {SPLIT.map((k) => <TableCell key={`a-${k}`} className={cn(num, 'text-brand-charcoal')}>{fmt(r.a, k)}</TableCell>)}
              {SPLIT.map((k) => <TableCell key={`b-${k}`} className={cn(num, 'text-brand-charcoal')}>{fmt(r.b, k)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  )
}
