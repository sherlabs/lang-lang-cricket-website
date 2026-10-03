import type { PlayerSeason } from '@/lib/domain'
import { pickCounts, type SeasonCounts } from '@/lib/players/season-math'
import { battingView, bowlingView, seasonYears, teamLabel } from '@/lib/players/view'
import { Panel } from '@/components/playhq/player-stats-tables'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const num = 'tabular-nums text-right'
const head = 'text-brand-grey'
const rowClass = 'border-brand-black/5 hover:bg-brand-stone/60'
const careerRowClass = 'border-t-2 border-brand-black/10 bg-brand-stone/40 font-semibold hover:bg-brand-stone/40'

function HeaderRow({ columns }: { columns: string[] }) {
  return (
    <TableRow className="border-brand-black/10 hover:bg-transparent">
      {['Season', 'Team'].map((h) => (
        <TableHead key={h} scope="col" className={head}>
          {h}
        </TableHead>
      ))}
      {columns.map((h) => (
        <TableHead key={h} scope="col" className={cn(head, num)}>
          {h}
        </TableHead>
      ))}
    </TableRow>
  )
}

function SeasonCells({ s, teamNamePrefix }: { s: PlayerSeason; teamNamePrefix?: string }) {
  return (
    <>
      <TableCell className="font-semibold text-brand-black">{seasonYears(s.seasonName)}</TableCell>
      <TableCell className="text-brand-charcoal">{teamLabel(s.teamName, teamNamePrefix)}</TableCell>
    </>
  )
}

/** Per-season batting and bowling for one player, with a Career totals row. Tables scroll sideways on phones. */
export function PlayerSeasonTables({
  seasons,
  career,
  teamNamePrefix,
}: {
  seasons: PlayerSeason[]
  career: SeasonCounts
  teamNamePrefix?: string
}) {
  const batRows = seasons.filter((s) => s.games > 0 || s.batInnings > 0)
  const bowlRows = seasons.filter((s) => s.bowlBalls > 0)
  const cb = battingView(career)
  const cw = bowlingView(career)

  return (
    <div className="space-y-8">
      <Panel title="Batting & fielding">
        <Table>
          <caption className="sr-only">Batting and fielding by season</caption>
          <TableHeader>
            <HeaderRow columns={['M', 'Inns', 'NO', 'Runs', 'HS', 'Avg', 'SR', '4s', '6s', 'Ct']} />
          </TableHeader>
          <TableBody>
            {batRows.map((s) => {
              const b = battingView(pickCounts(s))
              return (
                <TableRow key={s.id} className={rowClass}>
                  <SeasonCells s={s} teamNamePrefix={teamNamePrefix} />
                  {[s.games, b.innings, b.notOuts, b.runs, b.highScore, b.average, b.strikeRate, b.fours, b.sixes, s.catches].map(
                    (v, i) => (
                      <TableCell key={i} className={cn(num, i === 3 ? 'font-semibold text-brand-black' : 'text-brand-charcoal')}>
                        {v}
                      </TableCell>
                    )
                  )}
                </TableRow>
              )
            })}
            <TableRow className={careerRowClass}>
              <TableCell className="text-brand-black" colSpan={2}>
                Career
              </TableCell>
              {[career.games, cb.innings, cb.notOuts, cb.runs, cb.highScore, cb.average, cb.strikeRate, cb.fours, cb.sixes, career.catches].map(
                (v, i) => (
                  <TableCell key={i} className={cn(num, 'text-brand-black')}>
                    {v}
                  </TableCell>
                )
              )}
            </TableRow>
          </TableBody>
        </Table>
      </Panel>

      {bowlRows.length > 0 && (
        <Panel title="Bowling">
          <Table>
            <caption className="sr-only">Bowling by season</caption>
            <TableHeader>
              <HeaderRow columns={['O', 'M', 'R', 'W', 'Best', 'Avg', 'Econ']} />
            </TableHeader>
            <TableBody>
              {bowlRows.map((s) => {
                const w = bowlingView(pickCounts(s))
                return (
                  <TableRow key={s.id} className={rowClass}>
                    <SeasonCells s={s} teamNamePrefix={teamNamePrefix} />
                    {[w.overs, w.maidens, w.runs, w.wickets, w.best, w.average, w.economy].map((v, i) => (
                      <TableCell key={i} className={cn(num, i === 3 ? 'font-semibold text-brand-black' : 'text-brand-charcoal')}>
                        {v}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
              <TableRow className={careerRowClass}>
                <TableCell className="text-brand-black" colSpan={2}>
                  Career
                </TableCell>
                {[cw.overs, cw.maidens, cw.runs, cw.wickets, cw.best, cw.average, cw.economy].map((v, i) => (
                  <TableCell key={i} className={cn(num, 'text-brand-black')}>
                    {v}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  )
}
