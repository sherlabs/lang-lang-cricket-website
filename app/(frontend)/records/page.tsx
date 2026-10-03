import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { Panel } from '@/components/playhq/player-stats-tables'
import { RankBadge } from '@/components/stats/rank-badge'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { getClub } from '@/lib/club'
import { getStatsSettings } from '@/lib/site-settings'
import { careerOf, mergeBySeason } from '@/lib/stats/aggregate'
import { filterRows } from '@/lib/stats/leaderboard'
import { effectiveCategories } from '@/lib/stats/query-string'
import { getVisibleStatData } from '@/lib/stats/queries'
import { badgeFor } from '@/lib/stats/rank'
import { buildRecords, type RecordList } from '@/lib/stats/records'
import { coverageLine, currentSeasonName, shortSeason, sinceLabel } from '@/lib/stats/season-window'
import { canonicalFor, pageSeo } from '@/lib/site-metadata'
import { breadcrumbJsonLd } from '@/lib/structured-data'

// Same rendering mode as /stats (see the comment there): ISR with tag-cached data.
export const revalidate = 900

export async function generateMetadata() {
  return { alternates: canonicalFor('/records'), ...pageSeo(await getClub(), 'records') }
}

function RecordCard({ record, players }: { record: RecordList; players: Map<number, { name: string; slug: string }> }) {
  return (
    <Panel title={record.title}>
      {record.entries.length === 0 ? (
        <p className="px-3 py-4 text-sm text-brand-grey-light">No qualifying performance yet.</p>
      ) : (
        <ol className="divide-y divide-brand-black/5">
          {record.entries.map((e) => {
            const p = players.get(e.playerId)
            if (!p) return null
            return (
              <li key={`${e.playerId}-${e.season ?? ''}`} className="flex items-center gap-3 px-3 py-2.5">
                <RankBadge rank={e.rank} badge={badgeFor(e.rank)} />
                <div className="min-w-0 flex-1">
                  <Link href={`/players/${p.slug}`} className="font-semibold text-brand-black hover:text-brand-gold-deep hover:underline">{p.name}</Link>
                  {(e.season || e.grades.length > 0) && (
                    <p className="truncate text-xs text-brand-grey">
                      {[e.season ? shortSeason(e.season) : null, e.grades.join(' / ')].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {e.isNew && (
                  <span className="rounded-full bg-brand-gold-pale px-2 py-0.5 text-[11px] font-semibold text-brand-gold-deep ring-1 ring-brand-gold/30">New<span className="sr-only"> record this season</span></span>
                )}
                <span className="display text-2xl tabular-nums text-brand-black">{e.display}</span>
              </li>
            )
          })}
        </ol>
      )}
      {record.moreTied > 0 && <p className="px-3 pb-3 text-sm text-brand-grey">+{record.moreTied} more tied</p>}
    </Panel>
  )
}

export default async function RecordsPage() {
  const [club, settings, data] = await Promise.all([getClub(), getStatsSettings(), getVisibleStatData()])
  const copy = club.pageCopy.records
  const cats = effectiveCategories({ cats: null, juniors: false }, settings.defaultIncludedCategories)
  const rows = filterRows(data.rows, { cats, rules: settings.gradeRules })
  const records = buildRecords({
    career: careerOf(rows),
    seasons: mergeBySeason(rows),
    // Current season is data-defined from ALL visible rows (not the category-filtered ones).
    currentSeason: currentSeasonName(data.rows),
    qual: settings.qualification,
  })
  const since = sinceLabel(data.rows)
  const empty = rows.length === 0

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Records', href: '/records' }], club)} />
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
      <section className="container-site space-y-10 py-12 lg:py-16">
        <StatsSubNav current="/records" />
        <p className="text-sm text-brand-grey">{coverageLine(data.rows)}</p>
        {empty ? (
          <EmptyState>{copy.empty}</EmptyState>
        ) : (
          <>
            <div className="space-y-6">
              <SubHeading title={`Club records ${since}`} />
              <div className="grid gap-6 lg:grid-cols-2">
                {records.since.map((r) => <RecordCard key={r.key} record={r} players={data.players} />)}
              </div>
            </div>
            <div className="space-y-6">
              <SubHeading title="Single-season records" />
              <div className="grid gap-6 lg:grid-cols-2">
                {records.season.map((r) => <RecordCard key={r.key} record={r} players={data.players} />)}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
