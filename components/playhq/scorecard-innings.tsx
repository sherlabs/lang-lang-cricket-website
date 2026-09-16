import type { Innings } from '@/lib/playhq/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const num = 'tabular-nums text-right'
const head = 'text-brand-grey'

export function inningsTotalText(t: Innings['total']) {
  const wk = t.allOut || t.wickets >= 10 ? '' : `${t.wickets}/`
  return `${wk}${t.runs}${t.declared ? ' dec' : ''} (${t.overs} ov)`
}

function extrasText(e: Innings['extras']) {
  const parts: string[] = []
  if (e.wides) parts.push(`w ${e.wides}`)
  if (e.noBalls) parts.push(`nb ${e.noBalls}`)
  if (e.byes) parts.push(`b ${e.byes}`)
  if (e.legByes) parts.push(`lb ${e.legByes}`)
  if (e.penalty) parts.push(`pen ${e.penalty}`)
  return parts.length ? `Extras ${e.total} (${parts.join(', ')})` : `Extras ${e.total}`
}

export function ScorecardInnings({ innings }: { innings: Innings }) {
  const fow = innings.fallOfWickets
  return (
    <section className="rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-brand-black/10 px-5 py-4">
        <h3 className="display text-2xl text-brand-black">{innings.label}</h3>
        <p className="text-lg font-bold tabular-nums text-brand-black">{inningsTotalText(innings.total)}</p>
      </header>

      <div className="px-2 pb-2 pt-1 sm:px-3">
        <Table>
          <caption className="sr-only">Batting — {innings.battingTeamName}</caption>
          <TableHeader>
            <TableRow className="border-brand-black/10 hover:bg-transparent">
              <TableHead className={head}>Batting</TableHead>
              <TableHead className={cn(head, num)}>R</TableHead>
              <TableHead className={cn(head, num)}>B</TableHead>
              <TableHead className={cn(head, num)}>4s</TableHead>
              <TableHead className={cn(head, num)}>6s</TableHead>
              <TableHead className={cn(head, num)}>SR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {innings.batting.map((b) => (
              <TableRow key={b.appearanceId} className="border-brand-black/5 hover:bg-brand-stone/60">
                <TableCell className="whitespace-normal">
                  <span className="font-semibold text-brand-black">{b.name}</span>
                  <span className="block text-xs text-brand-grey">{b.dismissal}</span>
                </TableCell>
                <TableCell className={cn(num, 'font-semibold text-brand-black')}>
                  {b.runs}
                  {b.notOut ? '*' : ''}
                </TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{b.balls}</TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{b.fours}</TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{b.sixes}</TableCell>
                <TableCell className={cn(num, 'text-brand-charcoal')}>{b.balls ? b.strikeRate.toFixed(1) : '–'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="space-y-1 px-2 py-3 text-sm text-brand-grey">
          {innings.didNotBat.length > 0 && (
            <p>
              <span className="font-semibold text-brand-charcoal">Did not bat:</span> {innings.didNotBat.join(', ')}
            </p>
          )}
          <p>{extrasText(innings.extras)}</p>
          <p className="font-semibold text-brand-charcoal">
            Total {inningsTotalText(innings.total)}
          </p>
          {fow.length > 0 && (
            <p>
              <span className="font-semibold text-brand-charcoal">Fall of wickets:</span>{' '}
              {fow.map((f) => `${f.wicket}-${f.runs} (${f.name})`).join(', ')}
            </p>
          )}
        </div>

        {innings.bowling.length > 0 && (
          <Table>
            <caption className="sr-only">Bowling — {innings.bowlingTeamName}</caption>
            <TableHeader>
              <TableRow className="border-brand-black/10 hover:bg-transparent">
                <TableHead className={head}>Bowling</TableHead>
                <TableHead className={cn(head, num)}>O</TableHead>
                <TableHead className={cn(head, num)}>M</TableHead>
                <TableHead className={cn(head, num)}>R</TableHead>
                <TableHead className={cn(head, num)}>W</TableHead>
                <TableHead className={cn(head, num)}>Econ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {innings.bowling.map((b) => (
                <TableRow key={b.appearanceId} className="border-brand-black/5 hover:bg-brand-stone/60">
                  <TableCell className="whitespace-normal font-semibold text-brand-black">{b.name}</TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>{b.overs}</TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>{b.maidens}</TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>{b.runs}</TableCell>
                  <TableCell className={cn(num, 'font-semibold text-brand-black')}>{b.wickets}</TableCell>
                  <TableCell className={cn(num, 'text-brand-charcoal')}>{b.economy.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  )
}
