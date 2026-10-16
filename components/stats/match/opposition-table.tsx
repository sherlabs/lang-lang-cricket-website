'use client'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type OppositionRowView = {
  key: string
  label: string
  games: number
  innings: number
  runs: number
  average: string
  highScore: string
  fifties: number
  hundreds: number
  ducks: number
  wickets: number
  best: string
  economy: string
  catches: number
}

const SORTS = [
  { key: 'games', label: 'Games' },
  { key: 'runs', label: 'Runs' },
  { key: 'wickets', label: 'Wickets' },
] as const
type SortKey = (typeof SORTS)[number]['key']

const head = 'text-brand-grey'
const num = 'tabular-nums text-right'

/**
 * Per-opposition figures. The server renders the default order (most games first), so the table is
 * complete without JavaScript; the buttons only re-sort it in the browser.
 */
export function OppositionTable({ rows, caption }: { rows: OppositionRowView[]; caption: string }) {
  const [sort, setSort] = useState<SortKey>('games')
  const shown = sort === 'games' ? rows : [...rows].sort((a, b) => b[sort] - a[sort] || b.games - a.games || a.label.localeCompare(b.label))
  return (
    <div>
      <div role="group" aria-label="Sort the table" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-brand-grey">Sort by</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={sort === s.key}
            onClick={() => setSort(s.key)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full px-4 font-semibold transition',
              sort === s.key ? 'bg-brand-black text-white' : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow className="border-brand-black/10 hover:bg-transparent">
            <TableHead scope="col" className={head}>Opposition</TableHead>
            <TableHead scope="col" className={cn(head, num)}>M</TableHead>
            <TableHead scope="col" className={cn(head, num)}>Inns</TableHead>
            <TableHead scope="col" className={cn(head, num)}>Runs</TableHead>
            <TableHead scope="col" className={cn(head, num)}>Avg</TableHead>
            <TableHead scope="col" className={cn(head, num)}>HS</TableHead>
            <TableHead scope="col" className={cn(head, num)}>50s</TableHead>
            <TableHead scope="col" className={cn(head, num)}>100s</TableHead>
            <TableHead scope="col" className={cn(head, num)}>Ducks</TableHead>
            <TableHead scope="col" className={cn(head, num)}>Wkts</TableHead>
            <TableHead scope="col" className={cn(head, num)}>Best</TableHead>
            <TableHead scope="col" className={cn(head, num)}>Econ</TableHead>
            <TableHead scope="col" className={cn(head, num)}>Ct</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={r.key} className="border-brand-black/5 hover:bg-brand-stone/60">
              <TableCell className="font-semibold text-brand-black">{r.label}</TableCell>
              <TableCell className={num}>{r.games}</TableCell>
              <TableCell className={num}>{r.innings}</TableCell>
              <TableCell className={num}>{r.runs}</TableCell>
              <TableCell className={num}>{r.average}</TableCell>
              <TableCell className={num}>{r.highScore}</TableCell>
              <TableCell className={num}>{r.fifties}</TableCell>
              <TableCell className={num}>{r.hundreds}</TableCell>
              <TableCell className={num}>{r.ducks}</TableCell>
              <TableCell className={num}>{r.wickets}</TableCell>
              <TableCell className={num}>{r.best}</TableCell>
              <TableCell className={num}>{r.economy}</TableCell>
              <TableCell className={num}>{r.catches}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
