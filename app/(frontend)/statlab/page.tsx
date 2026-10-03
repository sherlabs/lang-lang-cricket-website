import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { Panel } from '@/components/playhq/player-stats-tables'
import { ShareButton } from '@/components/stats/share-button'
import { StatLabForm } from '@/components/stats/statlab-form'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getClub } from '@/lib/club'
import { canonicalFor, pageSeo } from '@/lib/site-metadata'
import { filterRows, gradeNames } from '@/lib/stats/leaderboard'
import { PRESETS, presetHref } from '@/lib/stats/presets'
import { sinceLabel } from '@/lib/stats/season-window'
import { ALL } from '@/lib/stats/query-string'
import { defaultDir, identityColumns, PAGE_ROWS, statLabHref } from '@/lib/stats/statlab'
import { runStatLab } from '@/lib/stats/statlab-queries'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { cn } from '@/lib/utils'

// Rendering mode, as on every stats route: ISR (`revalidate = 900`) over the tag-cached data layer.
export const revalidate = 900

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  const sp = await searchParams
  const filtered = Object.keys(sp).length > 0
  return {
    // A parameterised report is a near-duplicate of the base page: noindex and no canonical.
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor('/statlab') }),
    ...pageSeo(await getClub(), 'statlab'),
  }
}

const pill = 'inline-flex min-h-11 items-center rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-brand-charcoal ring-1 ring-brand-black/10 transition hover:ring-brand-gold/60'

export default async function StatLabPage({ searchParams }: Props) {
  const raw = await searchParams
  const [club, lab] = await Promise.all([getClub(), runStatLab(raw)])
  const copy = club.pageCopy.statlab
  const { params, result, data, settings, cats, hasJuniors } = lab
  const grades = gradeNames(filterRows(data.rows, { cats, rules: settings.gradeRules }))
  const shown = result.rows.slice(0, PAGE_ROWS)
  const id = identityColumns(params.scope)
  const href = statLabHref('/statlab', params)
  const qs = href.includes('?') ? href.slice(href.indexOf('?')) : ''
  const since = sinceLabel(data.rows)

  const sortHref = (key: string) => {
    const same = params.sort.key === key
    const dir = same ? (params.sort.dir === 'desc' ? 'asc' : 'desc') : key === 'name' ? 'asc' : defaultDir(key)
    return statLabHref('/statlab', { ...params, sort: { key, dir } })
  }
  const ariaSort = (key: string) => (params.sort.key === key ? (params.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined)

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'StatLab', href: '/statlab' }], club)} />
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
      <section className="container-site space-y-8 py-12 lg:py-16">
        <StatsSubNav current="/statlab" />

        <div className="space-y-4">
          <SubHeading title={copy.presetsHeading} />
          <ul className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <li key={p.key}>
                <Link href={presetHref(p)} title={p.blurb} className={pill}>{p.label}<span className="sr-only">. {p.blurb}</span></Link>
              </li>
            ))}
          </ul>
        </div>

        <StatLabForm params={params} seasons={data.seasons.map((s) => s.seasonName)} grades={grades} showJuniors={hasJuniors} />

        <div className="space-y-3">
          <SubHeading title="Your table" count={result.total} />
          <p className="text-sm text-brand-grey">
            Figures {params.season === ALL ? since : params.season}. {copy.coverageNote}
            {result.total > shown.length ? ` Showing the top ${shown.length} of ${result.total}; the download has up to 5,000.` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`/statlab/export${qs}`} className="inline-flex min-h-11 items-center rounded-md bg-brand-black px-4 text-sm font-semibold text-white transition hover:bg-brand-charcoal">
              Download CSV<span className="sr-only"> of this table</span>
            </a>
            <ShareButton path={href} title={`${club.name} StatLab report`} label="Copy link to this report" tone="light" />
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState>{copy.empty}</EmptyState>
        ) : (
          <Panel title="Results">
            <Table>
              <caption className="sr-only">
                StatLab table, {params.scope === 'career' ? 'one row per player' : 'one row per player and season'}, {params.season === ALL ? since : params.season}. Select a column heading to sort by it.
              </caption>
              <TableHeader>
                <TableRow className="border-brand-black/10 hover:bg-transparent">
                  <TableHead scope="col" aria-sort={ariaSort('name')} className="text-brand-grey">
                    <Link href={sortHref('name')} className="hover:text-brand-black hover:underline">Player</Link>
                  </TableHead>
                  {id.map((c) => (
                    <TableHead key={c.key} scope="col" className={cn('text-brand-grey', c.key === 'seasons' && 'text-right')}>{c.label}</TableHead>
                  ))}
                  {result.columns.map((m) => (
                    <TableHead key={m.key} scope="col" aria-sort={ariaSort(m.key)} className="text-right tabular-nums text-brand-grey">
                      <Link href={sortHref(m.key)} title={m.label} className={cn('hover:text-brand-black hover:underline', params.sort.key === m.key && 'text-brand-black')}>
                        {m.short}
                        <span className="sr-only"> ({m.label})</span>
                        {params.sort.key === m.key && <span aria-hidden> {params.sort.dir === 'asc' ? '↑' : '↓'}</span>}
                      </Link>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r, i) => (
                  <TableRow key={`${r.playerId}-${r.season}-${r.team}-${i}`} className="border-brand-black/5 hover:bg-brand-stone/60">
                    <TableCell className="whitespace-nowrap font-semibold text-brand-black">
                      <Link href={`/players/${r.slug}`} className="hover:text-brand-gold-deep hover:underline">{r.name}</Link>
                    </TableCell>
                    {id.map((c) => (
                      <TableCell key={c.key} className={cn('whitespace-nowrap text-brand-charcoal', c.key === 'seasons' && 'text-right tabular-nums')}>
                        {c.key === 'seasons' ? r.seasons : r[c.key] || '–'}
                      </TableCell>
                    ))}
                    {result.columns.map((m) => (
                      <TableCell key={m.key} className={cn('text-right tabular-nums text-brand-charcoal', params.sort.key === m.key && 'font-semibold text-brand-black')}>{m.format(r.counts)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        )}
      </section>
    </main>
  )
}
