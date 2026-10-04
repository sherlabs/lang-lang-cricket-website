import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { Panel } from '@/components/playhq/player-stats-tables'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getClub } from '@/lib/club'
import { getAllFacts, filterMatchFacts } from '@/lib/match-store/stats-queries'
import { getStatsSettings } from '@/lib/site-settings'
import { baseOpenGraph, canonicalFor, titleWithSuffix } from '@/lib/site-metadata'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { buildLabelMap, canonicalGrade } from '@/lib/stats/labels'
import { coverageCaption, coverageOf, formatCoverageDate } from '@/lib/stats/match/coverage'
import { headToHead, type HeadToHeadRow } from '@/lib/stats/match/opposition'
import { effectiveCategories, first } from '@/lib/stats/query-string'
import { cn } from '@/lib/utils'

// Same rendering mode as /stats: ISR with tag-cached data.
export const revalidate = 900

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  const club = await getClub()
  const filtered = first((await searchParams).club) !== undefined
  return {
    title: titleWithSuffix(club, 'Head to head'),
    description: `Results against every club ${club.name} has played, from the stored match data.`,
    // A detail view is a near-duplicate of the table: noindex, and a noindex page carries no canonical.
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor('/stats/opposition') }),
    openGraph: baseOpenGraph(club),
  }
}

const head = 'text-brand-grey'
const num = 'tabular-nums text-right'
const nf = (v: number | null) => (v === null ? '–' : String(v))

const resultWord = (r: string | null) => (r === 'won' ? 'Won' : r === 'lost' ? 'Lost' : r === 'draw' ? 'Drawn' : r === 'tie' ? 'Tied' : r === 'no_result' ? 'No result' : (r ?? ''))

function forfeitText(r: HeadToHeadRow): string {
  const parts = [r.wonByForfeit ? `${r.wonByForfeit} won` : '', r.lostByForfeit ? `${r.lostByForfeit} lost` : ''].filter(Boolean)
  return parts.length ? parts.join(', ') : '–'
}

export default async function OppositionPage({ searchParams }: Props) {
  const [club, settings, all] = await Promise.all([getClub(), getStatsSettings(), getAllFacts().catch((err) => {
    console.warn('[stats] opposition unavailable:', (err as Error).message)
    return null
  })])
  const cats = effectiveCategories({ cats: null, juniors: false }, settings.defaultIncludedCategories)
  const set = all ? filterMatchFacts(all, { cats, rules: settings.gradeRules }) : null
  const rows = set ? headToHead(set, settings.matchMinimums) : []
  const selectedKey = first((await searchParams).club)
  const selected = rows.find((r) => r.key === selectedKey) ?? null
  const caption = set ? coverageCaption(coverageOf(set)) : ''
  const labels = set ? buildLabelMap([...set.matches.values()].map((h) => ({ kind: 'grade' as const, label: h.grade }))) : null
  const meetings = set && selected ? [...set.matches.values()].filter((h) => h.oppKey === selected.key).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')) : []

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Head to head', href: '/stats/opposition' }], club)} />
      <PageHeader eyebrow="Stats" title="Head to head" intro={`How ${club.name} has gone against every club it has met, from the stored match data.`} />
      <section className="container-site space-y-8 py-12 lg:py-16">
        <StatsSubNav current="/stats/opposition" />
        {rows.length === 0 ? (
          <EmptyState>No matches are stored yet, so there is no head to head to show.</EmptyState>
        ) : (
          <>
            <div className="space-y-2">
              <SubHeading title="Against each club" count={rows.length} />
              <p className="text-sm text-brand-grey">{caption} Senior games only: junior games are not in the match data. Win percentage excludes forfeits and games with no result, and needs {settings.matchMinimums.winGames} games with a result. Lowest completed innings counts only innings that ended all out.</p>
            </div>
            <Panel title="Results">
              <div className="overflow-x-auto">
                <Table className="min-w-[56rem]">
                  <caption className="sr-only">Results against each opposition club, from match data. {caption}</caption>
                  <TableHeader>
                    <TableRow className="border-brand-black/10 hover:bg-transparent">
                      <TableHead scope="col" className={head}>Opposition</TableHead>
                      <TableHead scope="col" className={cn(head, num)}>P</TableHead>
                      <TableHead scope="col" className={cn(head, num)}>W</TableHead>
                      <TableHead scope="col" className={cn(head, num)}>L</TableHead>
                      <TableHead scope="col" className={cn(head, num)}>D</TableHead>
                      <TableHead scope="col" className={cn(head, num)}>T</TableHead>
                      <TableHead scope="col" className={cn(head, num)}>NR</TableHead>
                      <TableHead scope="col" className={head}>Forfeits</TableHead>
                      <TableHead scope="col" className={cn(head, num)}>Win%</TableHead>
                      <TableHead scope="col" className={head}>Last meeting</TableHead>
                      <TableHead scope="col" className={cn(head, num)}>Highest for</TableHead>
                      <TableHead scope="col" className={cn(head, num)}>Highest against</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.key} className={cn('border-brand-black/5 hover:bg-brand-stone/60', selected?.key === r.key && 'bg-brand-gold-pale')}>
                        <TableCell className="font-semibold text-brand-black">
                          <Link href={`/stats/opposition?club=${encodeURIComponent(r.key)}#detail`} className="hover:text-brand-gold-deep hover:underline">{r.label}</Link>
                        </TableCell>
                        <TableCell className={num}>{r.played}</TableCell>
                        <TableCell className={num}>{r.won}</TableCell>
                        <TableCell className={num}>{r.lost}</TableCell>
                        <TableCell className={num}>{r.drawn}</TableCell>
                        <TableCell className={num}>{r.tied}</TableCell>
                        <TableCell className={num}>{r.noResult}</TableCell>
                        <TableCell className="whitespace-nowrap text-brand-charcoal">{forfeitText(r)}</TableCell>
                        <TableCell className={num}>{r.winPct === null ? 'n/a' : `${r.winPct.toFixed(0)}%`}</TableCell>
                        <TableCell className="whitespace-nowrap text-brand-charcoal">{r.lastMeeting ? formatCoverageDate(r.lastMeeting) : '–'}</TableCell>
                        <TableCell className={num}>{nf(r.highestFor)}</TableCell>
                        <TableCell className={num}>{nf(r.highestAgainst)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>

            {selected && labels && (
              <div id="detail" className="scroll-mt-24 space-y-4">
                <SubHeading title={selected.label} />
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['Played', String(selected.played)],
                    ['Last meeting', selected.lastMeeting ? `${formatCoverageDate(selected.lastMeeting)}, ${selected.lastResult && selected.lastResult.includes('forfeit') ? selected.lastResult : resultWord(selected.lastResult)}` : '–'],
                    ['Highest score for / against', `${nf(selected.highestFor)} / ${nf(selected.highestAgainst)}`],
                    ['Lowest completed innings for / against', `${nf(selected.lowestCompletedFor)} / ${nf(selected.lowestCompletedAgainst)}`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-brand-grey">{k}</dt>
                      <dd className="mt-1 text-brand-black">{v}</dd>
                    </div>
                  ))}
                </dl>
                <Panel title="Meetings">
                  <ul className="divide-y divide-brand-black/5">
                    {meetings.map((h) => (
                      <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
                        <span className="tabular-nums text-brand-grey">{h.date ? formatCoverageDate(h.date) : 'Date not recorded'}</span>
                        <span className="text-brand-charcoal">{h.grade ? canonicalGrade(h.grade, labels) : h.team}</span>
                        <span className="font-semibold text-brand-black">
                          {h.forfeit ? `${resultWord(h.result)} by forfeit` : `${resultWord(h.result)}${h.result === 'won' && h.firstInnings ? ' on first innings' : ''}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
                <p className="text-sm"><Link href="/stats/opposition" className="font-semibold text-brand-gold-deep underline underline-offset-2">Back to every club</Link></p>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
