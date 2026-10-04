import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { Panel } from '@/components/playhq/player-stats-tables'
import { CategoryChecks } from '@/components/stats/category-checks'
import { RankBadge } from '@/components/stats/rank-badge'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { getClub } from '@/lib/club'
import { filterMatchFacts, getAllFacts, getVisiblePlayerNames } from '@/lib/match-store/stats-queries'
import { getStatsSettings } from '@/lib/site-settings'
import { baseOpenGraph, canonicalFor, titleWithSuffix } from '@/lib/site-metadata'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { CATEGORY_LABELS, classifyGrade, GRADE_CATEGORIES, parseCategories } from '@/lib/stats/categories'
import { buildLabelMap, canonicalGrade } from '@/lib/stats/labels'
import { coverageCaption, coverageOf, formatCoverageDate } from '@/lib/stats/match/coverage'
import { partnershipCoverageText, partnershipRecordsByWicket, partnershipTop, type PartnershipRecordLine } from '@/lib/stats/match/records'
import { ALL, catParam, effectiveCategories, first } from '@/lib/stats/query-string'
import { badgeFor, ordinal } from '@/lib/stats/rank'

export const revalidate = 900

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  const club = await getClub()
  const sp = await searchParams
  const filtered = ['season', 'cat'].some((k) => sp[k] !== undefined)
  return {
    title: titleWithSuffix(club, 'Partnership records'),
    description: `The best batting partnerships for ${club.name}, inferred from batting order and fall of wickets.`,
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor('/records/partnerships') }),
    openGraph: baseOpenGraph(club),
  }
}

const selectClass = 'min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black'

export default async function PartnershipRecordsPage({ searchParams }: Props) {
  const [club, settings, all, players] = await Promise.all([
    getClub(), getStatsSettings(),
    getAllFacts().catch((err) => {
      console.warn('[records] partnerships unavailable:', (err as Error).message)
      return null
    }),
    getVisiblePlayerNames(),
  ])
  const sp = await searchParams
  const cats = effectiveCategories({ cats: parseCategories(catParam(sp.cat)).length ? parseCategories(catParam(sp.cat)) : null, juniors: false }, settings.defaultIncludedCategories)
  const seasons = all ? [...new Set([...all.matches.values()].map((h) => h.seasonName))].sort().reverse() : []
  const seasonIn = first(sp.season)
  const season = seasonIn && seasons.includes(seasonIn) ? seasonIn : ALL
  const present = all
    ? GRADE_CATEGORIES.filter((c) => [...all.matches.values()].some((h) => classifyGrade(h.grade, h.team, settings.gradeRules) === c))
    : []
  const set = all ? filterMatchFacts(all, { cats, rules: settings.gradeRules, season: season === ALL ? undefined : season }) : null
  const byWicket = set ? partnershipRecordsByWicket(set) : []
  const top = set ? partnershipTop(set, 25) : []
  const labels = set ? buildLabelMap([...set.matches.values()].map((h) => ({ kind: 'grade' as const, label: h.grade }))) : null
  const caption = set ? coverageCaption(coverageOf(set), 'fow') : ''

  const who = (id: number | null) => {
    const p = id === null ? undefined : players.get(id)
    return p ? <Link href={`/players/${p.slug}`} className="font-semibold text-brand-black hover:text-brand-gold-deep hover:underline">{p.name}</Link> : <span className="font-semibold text-brand-black">a club player</span>
  }
  const line = (l: PartnershipRecordLine, wicketHeading: boolean) => (
    <li key={`${l.p.m}-${l.p.seq}-${l.p.wicket}`} className="flex items-center gap-3 px-3 py-2.5">
      {wicketHeading ? <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-brand-grey">{ordinal(l.p.wicket)}</span> : <RankBadge rank={l.rank} badge={badgeFor(l.rank)} />}
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-brand-charcoal">{who(l.p.a)} and {who(l.p.b)}</p>
        <p className="truncate text-xs text-brand-grey">
          {[wicketHeading ? null : `${ordinal(l.p.wicket)} wicket${l.p.unbroken ? ', unbroken' : ''}`, l.header?.date ? formatCoverageDate(l.header.date) : null, l.header ? `v ${l.header.oppLabel}` : null, l.header?.grade && labels ? canonicalGrade(l.header.grade, labels) : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="display text-2xl tabular-nums text-brand-black">{l.p.runs}{l.p.unbroken ? '*' : ''}</span>
    </li>
  )

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Records', href: '/records' }, { name: 'Partnerships', href: '/records/partnerships' }], club)} />
      <PageHeader eyebrow="Records" title="Partnership records" intro="The best batting stands, inferred from batting order and fall of wickets." />
      <section className="container-site space-y-8 py-12 lg:py-16">
        <StatsSubNav current="/records" />
        {!set || set.partnerships.length === 0 ? (
          <EmptyState>No partnerships can be worked out yet. They need stored matches with a complete fall of wickets.</EmptyState>
        ) : (
          <>
            <form method="get" action="/records/partnerships" className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label htmlFor="pr-season" className="eyebrow">Season</label>
                  <select id="pr-season" name="season" defaultValue={season} className={`${selectClass} mt-2`}>
                    <option value={ALL}>All stored seasons</option>
                    {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <CategoryChecks categories={present} selected={cats} />
              <div><button type="submit" className="min-h-11 rounded-md bg-brand-black px-5 text-sm font-semibold text-white transition hover:bg-brand-charcoal">Apply</button></div>
            </form>

            <div className="space-y-2">
              <SubHeading title="Best at each wicket" />
              <p className="text-sm text-brand-grey">
                From match data. Pairs are <strong>inferred</strong> from batting order and fall of wickets (PlayHQ does not say who batted with whom) and include extras. An asterisk marks an unbroken stand.
                {' '}{caption} {partnershipCoverageText(set)} Categories: {cats.map((c) => CATEGORY_LABELS[c]).join(', ')}.
              </p>
            </div>
            {byWicket.length === 0 ? (
              <EmptyState>No partnership between two visible players matches this selection.</EmptyState>
            ) : (
              <Panel title="Wicket by wicket"><ol className="divide-y divide-brand-black/5">{byWicket.map((l) => line(l, true))}</ol></Panel>
            )}
            {top.length > 0 && (
              <div className="space-y-4">
                <SubHeading title="Top 25 overall" />
                <Panel title="Highest stands"><ol className="divide-y divide-brand-black/5">{top.map((l) => line(l, false))}</ol></Panel>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
