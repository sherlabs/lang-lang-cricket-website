import type { PlayerSeasonStats } from '@/lib/playhq/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const num = 'tabular-nums text-right'
const head = 'text-brand-grey'
const fmt = (v: number | null, dp = 2) => (v == null ? '–' : v.toFixed(dp))

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
      <h3 className="display border-b border-brand-black/10 px-5 py-4 text-2xl text-brand-black">{title}</h3>
      <div className="px-2 pb-2 pt-1 sm:px-3">{children}</div>
    </div>
  )
}

export function PlayerStatsTables({ stats, gamesCounted }: { stats: PlayerSeasonStats[]; gamesCounted: number }) {
  const batting = [...stats].sort((a, b) => b.batting.runs - a.batting.runs || b.batting.innings - a.batting.innings)
  const bowling = stats
    .filter((p) => p.bowling.balls > 0)
    .sort((a, b) => b.bowling.wickets - a.bowling.wickets || a.bowling.runs - b.bowling.runs)

  return (
    <div className="space-y-8">
      <p className="text-sm text-brand-grey">
        From {gamesCounted} completed {gamesCounted === 1 ? 'match' : 'matches'} this season.
      </p>
      <Panel title="Batting & fielding">
        <Table>
          <caption className="sr-only">Batting and fielding, this season</caption>
          <TableHeader>
            <TableRow className="border-brand-black/10 hover:bg-transparent">
              <TableHead scope="col" className={head}>Player</TableHead>
              <TableHead scope="col" className={cn(head, num)}>M</TableHead>
              <TableHead scope="col" className={cn(head, num)}>Inns</TableHead>
              <TableHead scope="col" className={cn(head, num)}>NO</TableHead>
              <TableHead scope="col" className={cn(head, num)}>Runs</TableHead>
              <TableHead scope="col" className={cn(head, num)}>HS</TableHead>
              <TableHead scope="col" className={cn(head, num)}>Avg</TableHead>
              <TableHead scope="col" className={cn(head, num)}>SR</TableHead>
              <TableHead scope="col" className={cn(head, num)}>Ct</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batting.map((p) => (
              <TableRow key={p.key} className="border-brand-black/5 hover:bg-brand-stone/60">
                <TableCell className="whitespace-normal font-semibold text-brand-black">{p.name}</TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{p.games}</TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{p.batting.innings}</TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{p.batting.notOuts}</TableCell>
                <TableCell className={cn(num, 'font-semibold text-brand-black')}>{p.batting.runs}</TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>
                  {p.batting.innings ? `${p.batting.highScore}${p.batting.highScoreNotOut ? '*' : ''}` : '–'}
                </TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{fmt(p.batting.average)}</TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{fmt(p.batting.strikeRate, 1)}</TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{p.catches}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      {bowling.length > 0 && (
        <Panel title="Bowling">
          <Table>
            <caption className="sr-only">Bowling, this season</caption>
            <TableHeader>
              <TableRow className="border-brand-black/10 hover:bg-transparent">
                <TableHead scope="col" className={head}>Player</TableHead>
                <TableHead scope="col" className={cn(head, num)}>O</TableHead>
                <TableHead scope="col" className={cn(head, num)}>M</TableHead>
                <TableHead scope="col" className={cn(head, num)}>R</TableHead>
                <TableHead scope="col" className={cn(head, num)}>W</TableHead>
                <TableHead scope="col" className={cn(head, num)}>Best</TableHead>
                <TableHead scope="col" className={cn(head, num)}>Avg</TableHead>
                <TableHead scope="col" className={cn(head, num)}>Econ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bowling.map((p) => (
                <TableRow key={p.key} className="border-brand-black/5 hover:bg-brand-stone/60">
                  <TableCell className="whitespace-normal font-semibold text-brand-black">{p.name}</TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>{p.bowling.overs}</TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>{p.bowling.maidens}</TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>{p.bowling.runs}</TableCell>
                  <TableCell className={cn(num, 'font-semibold text-brand-black')}>{p.bowling.wickets}</TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>
                    {p.bowling.bestWickets}/{p.bowling.bestRuns}
                  </TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>{fmt(p.bowling.average)}</TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>{fmt(p.bowling.economy)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  )
}
