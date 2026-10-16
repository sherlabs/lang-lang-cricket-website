import Link from 'next/link'
import { Panel } from '@/components/playhq/player-stats-tables'
import { LeaderboardTable } from '@/components/stats/leaderboard-table'
import { SubHeading } from '@/components/stats/sub-heading'
import { WinLossChart } from '@/components/stats/win-loss-chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CLUB_LOCALE } from '@/config/site'
import { formatCoverageDate } from '@/lib/stats/match/coverage'
import type { MatchRecords, PartnershipRecordLine } from '@/lib/stats/match/records'
import { ALLROUNDER_FORMULA, resultLetter, resultWord, sideScore, type GradeLines, type GradeProgression } from '@/lib/stats/match/yearbook'
import { ordinal } from '@/lib/stats/rank'

/** Match-data sections of a yearbook (W2 spec 5.5). Each carries its coverage caption and says its source. */
export type Name = { name: string; slug: string | null }
const date = (d: string | null) => (d ? formatCoverageDate(d, CLUB_LOCALE) : '–')

function PlayerLink({ id, names }: { id: number | null; names: ReadonlyMap<number, Name> }) {
  const p = id === null ? undefined : names.get(id)
  if (!p) return <span>a club player</span>
  return p.slug ? <Link href={`/players/${p.slug}`} className="font-semibold text-brand-black hover:text-brand-gold-deep hover:underline">{p.name}</Link> : <span className="font-semibold text-brand-black">{p.name}</span>
}

export function YearbookMatchResults({ byGrade, caption }: { byGrade: GradeLines[]; caption: string }) {
  if (!byGrade.length) return null
  return (
    <section aria-labelledby="yb-results" className="print-section space-y-6">
      <SubHeading id="yb-results" title="Results by grade" />
      <p className="text-sm text-brand-grey">Scores and results from the stored scorecards (match data). {caption}</p>
      <div className="space-y-4">
        {byGrade.map((g) => (
          <details key={g.grade} className="group rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5" open={byGrade.length === 1}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
              <span className="display text-xl text-brand-black">{g.grade}</span>
              <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">{g.lines.length}</span>
            </summary>
            <div className="overflow-x-auto px-2 pb-3">
              <Table>
                <caption className="sr-only">{g.grade} results with scores, newest first</caption>
                <TableHeader>
                  <TableRow className="border-brand-black/10 hover:bg-transparent">
                    <TableHead scope="col" className="text-brand-grey">Date</TableHead>
                    <TableHead scope="col" className="text-brand-grey">Round</TableHead>
                    <TableHead scope="col" className="text-brand-grey">Opposition</TableHead>
                    <TableHead scope="col" className="text-brand-grey">Our score</TableHead>
                    <TableHead scope="col" className="text-brand-grey">Their score</TableHead>
                    <TableHead scope="col" className="text-brand-grey">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.lines.map((l) => (
                    <TableRow key={l.gameId} className="border-brand-black/5">
                      <TableCell className="whitespace-nowrap text-brand-charcoal">{date(l.date)}</TableCell>
                      <TableCell className="whitespace-nowrap text-brand-charcoal">{l.round ?? '–'}</TableCell>
                      <TableCell className="text-brand-black">{l.opponent}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-brand-charcoal">{l.forfeit ? '–' : sideScore(l.club)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-brand-charcoal">{l.forfeit ? '–' : sideScore(l.opp)}</TableCell>
                      <TableCell className="whitespace-nowrap font-semibold text-brand-black">
                        <span aria-hidden className="mr-1.5 inline-block w-4 text-center">{resultLetter(l) === 'U' ? '–' : resultLetter(l)}</span>
                        {resultWord(l)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

export function YearbookProgression({ items, caption }: { items: GradeProgression[]; caption: string }) {
  const shown = items.filter((p) => p.cells.length > 0)
  if (!shown.length) return null
  return (
    <section aria-labelledby="yb-progression" className="print-section space-y-6">
      <SubHeading id="yb-progression" title="Win and loss progression" />
      <p className="text-sm text-brand-grey">W won, L lost, D drawn, T tied, N no result; f marks a forfeit. From match data. {caption}</p>
      <div className="grid gap-6">
        {shown.map((p, i) => <WinLossChart key={p.grade} progression={p} idPrefix={`yb-wl-${i}`} />)}
      </div>
    </section>
  )
}

export function YearbookPartnerships({ byWicket, top, names, caption, note }: { byWicket: PartnershipRecordLine[]; top: PartnershipRecordLine[]; names: ReadonlyMap<number, Name>; caption: string; note: string }) {
  if (!byWicket.length && !top.length) return null
  const row = (l: PartnershipRecordLine, label: string) => (
    <li key={`${label}-${l.p.m}-${l.p.seq}-${l.p.wicket}`} className="flex items-center gap-4 px-4 py-3">
      <span className="display w-16 text-right text-2xl tabular-nums text-brand-black">{l.p.runs}{l.p.unbroken ? '*' : ''}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-brand-charcoal"><PlayerLink id={l.p.a} names={names} /> and <PlayerLink id={l.p.b} names={names} /></p>
        <p className="truncate text-xs text-brand-grey">{[label, date(l.header?.date ?? null), l.header ? `v ${l.header.oppLabel}` : null].filter(Boolean).join(' · ')}</p>
      </div>
    </li>
  )
  return (
    <section aria-labelledby="yb-partnerships" className="print-section space-y-6">
      <SubHeading id="yb-partnerships" title="Partnership records" />
      <p className="text-sm text-brand-grey">Inferred from batting order and fall of wickets, so they include extras; an asterisk marks an unbroken stand. From match data. {caption} {note}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        {byWicket.length > 0 && (
          <Panel title="Best at each wicket">
            <ol className="divide-y divide-brand-black/5">{[...byWicket].sort((a, b) => a.p.wicket - b.p.wicket).map((l) => row(l, `${ordinal(l.p.wicket)} wicket`))}</ol>
          </Panel>
        )}
        {top.length > 0 && (
          <Panel title="Top five of the season">
            <ol className="divide-y divide-brand-black/5">{top.map((l) => row(l, `${ordinal(l.p.wicket)} wicket`))}</ol>
          </Panel>
        )}
      </div>
    </section>
  )
}

export type HighlightLine = { label: string; value: string; playerId: number | null; detail: string | null }

/** The leading entry (and any tie, up to three) of a match record list as highlight lines. */
export function highlightLines(records: MatchRecords): HighlightLine[] {
  const lead = (label: string, list: MatchRecords['highestScores']): HighlightLine[] =>
    list.entries.filter((e) => e.rank === 1).slice(0, 3).map((e) => ({ label, value: e.display, playerId: e.playerId, detail: e.detail }))
  const fifties = records.counts.find((c) => c.key === 'fifties')
  return [
    ...lead('Highest score', records.highestScores),
    ...lead('Best bowling figures', records.bestFigures),
    ...(fifties ? lead('Most fifties', fifties) : []),
  ]
}

export function YearbookHighlights({
  lines, partnership, allRounders, names, caption, seasonAllRounders,
}: {
  lines: HighlightLine[]
  partnership: PartnershipRecordLine | null
  allRounders: { key: number; rank: number; name: string; slug: string; value: string; context: string }[]
  names: ReadonlyMap<number, Name>
  caption: string
  /** The existing season-totals all-rounder rows, relabelled: shown in its own block, never merged. */
  seasonAllRounders?: React.ReactNode
}) {
  if (!lines.length && !partnership && !allRounders.length) return null
  return (
    <section aria-labelledby="yb-highlights" className="print-section space-y-6">
      <SubHeading id="yb-highlights" title="Season highlights" />
      <p className="text-sm text-brand-grey">Stat leaders from the stored scorecards (match data), not club honours. {caption}</p>
      {(lines.length > 0 || partnership) && (
        <Panel title="Leaders, from match data">
          <ul className="divide-y divide-brand-black/5">
            {lines.map((h, i) => (
              <li key={`${h.label}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 px-3 py-2.5 text-sm">
                <span className="text-brand-grey">{h.label}</span>
                <span className="text-brand-charcoal"><span className="display text-xl tabular-nums text-brand-black">{h.value}</span> <PlayerLink id={h.playerId} names={names} />{h.detail ? <span className="text-brand-grey"> · {h.detail}</span> : null}</span>
              </li>
            ))}
            {partnership && (
              <li className="flex flex-wrap items-baseline justify-between gap-x-4 px-3 py-2.5 text-sm">
                <span className="text-brand-grey">Best partnership (inferred)</span>
                <span className="text-brand-charcoal"><span className="display text-xl tabular-nums text-brand-black">{partnership.p.runs}{partnership.p.unbroken ? '*' : ''}</span> <PlayerLink id={partnership.p.a} names={names} /> and <PlayerLink id={partnership.p.b} names={names} /></span>
              </li>
            )}
          </ul>
        </Panel>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {allRounders.length > 0 && (
          <LeaderboardTable
            title="Top all-rounders, from match data"
            caption={`Top all-rounders from match data. Ranked by ${ALLROUNDER_FORMULA}. Ties share a rank.`}
            valueLabel="Score"
            contextLabel="Runs / wkts"
            rows={allRounders}
            footer={<p className="px-3 pb-3 pt-1 text-sm text-brand-grey">Worked out from the stored scorecards. A stat ranking, not an award.</p>}
          />
        )}
        {seasonAllRounders}
      </div>
    </section>
  )
}
