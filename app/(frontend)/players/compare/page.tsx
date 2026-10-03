import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { CompareTable, SeasonSplitTable } from '@/components/stats/compare-table'
import { ShareButton } from '@/components/stats/share-button'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { getClub } from '@/lib/club'
import { getStatsSettings } from '@/lib/site-settings'
import { canonicalFor, pageSeo } from '@/lib/site-metadata'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { careerOf, mergeBySeason } from '@/lib/stats/aggregate'
import { commonSeasonNames, compareCounts, seasonSplit } from '@/lib/stats/compare'
import { filterRows } from '@/lib/stats/leaderboard'
import { getVisibleStatData } from '@/lib/stats/queries'
import { sinceLabel } from '@/lib/stats/season-window'
import { EMPTY_COUNTS } from '@/lib/players/season-math'

// Same rendering mode as the other stats routes (see /stats): ISR with tag-cached data.
export const revalidate = 900

type SP = Record<string, string | string[] | undefined>
type Props = { searchParams: Promise<SP> }

const one = (v: string | string[] | undefined): string => {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s.trim().slice(0, 120) : ''
}

export async function generateMetadata({ searchParams }: Props) {
  const sp = await searchParams
  const filtered = ['a', 'b', 'common'].some((k) => sp[k] !== undefined)
  return {
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor('/players/compare') }),
    ...pageSeo(await getClub(), 'compare'),
  }
}

const selectClass = 'mt-2 min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black'

export default async function ComparePage({ searchParams }: Props) {
  const sp = await searchParams
  const [club, settings, data] = await Promise.all([getClub(), getStatsSettings(), getVisibleStatData()])
  const copy = club.pageCopy.compare
  const slugA = one(sp.a), slugB = one(sp.b)
  const common = one(sp.common) === '1'

  // Hidden players are not in `data.players`, so a hidden slug is simply unknown.
  const bySlug = new Map([...data.players.values()].map((p) => [p.slug, p]))
  const pa = slugA ? bySlug.get(slugA) : undefined
  const pb = slugB ? bySlug.get(slugB) : undefined
  const unknown = [slugA && !pa ? 'first' : '', slugB && !pb ? 'second' : ''].filter(Boolean)
  const same = Boolean(pa && pb && pa.id === pb.id)

  const rows = filterRows(data.rows, { cats: settings.defaultIncludedCategories, rules: settings.gradeRules })
  const seasonsOf = (id: number | undefined) => (id === undefined ? [] : mergeBySeason(rows.filter((r) => r.playerId === id)))
  // Players with no rows in the default categories (e.g. junior-only) would give an empty table, so they are not offered.
  const withStats = new Set(rows.map((r) => r.playerId))
  const options = [...data.players.values()].filter((p) => withStats.has(p.id) || p.slug === slugA || p.slug === slugB).sort((x, y) => x.name.localeCompare(y.name))
  const sa = seasonsOf(pa?.id), sb = seasonsOf(pb?.id)
  const shared = commonSeasonNames(sa, sb)
  const only = common ? shared : undefined
  const careerFor = (id: number | undefined) =>
    careerOf(rows.filter((r) => r.playerId === id && (!only || only.includes(r.seasonName))))[0]?.counts ?? EMPTY_COUNTS

  const ready = Boolean(pa && pb && !same)
  const since = sinceLabel(data.rows)
  const href = (a: string, b: string, c = common) => `/players/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}${c ? '&common=1' : ''}`

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Players', href: '/players' }, { name: 'Compare', href: '/players/compare' }], club)} />
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
      <section className="container-site space-y-8 py-12 lg:py-16">
        <form method="get" action="/players/compare" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <div>
            <label htmlFor="cmp-a" className="eyebrow">First player</label>
            <select id="cmp-a" name="a" defaultValue={pa ? pa.slug : ''} className={selectClass}>
              <option value="">Choose a player</option>
              {options.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cmp-b" className="eyebrow">Second player</label>
            <select id="cmp-b" name="b" defaultValue={pb ? pb.slug : ''} className={selectClass}>
              <option value="">Choose a player</option>
              {options.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-black">
            <input type="checkbox" name="common" value="1" defaultChecked={common} className="h-4 w-4 accent-brand-gold" />
            Only seasons both played
          </label>
          <button type="submit" className="min-h-11 rounded-md bg-brand-black px-5 text-sm font-semibold text-white transition hover:bg-brand-charcoal">
            Compare
          </button>
        </form>

        {unknown.length > 0 && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {copy.unknownPlayer} ({unknown.join(' and ')} player)
          </p>
        )}
        {same && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{copy.sameLabel}</p>
        )}

        {ready && (sa.length === 0 || sb.length === 0) && (
          <p role="status" className="rounded-lg bg-brand-gold-pale px-4 py-3 text-sm text-brand-charcoal ring-1 ring-brand-gold/30">
            {[sa.length === 0 ? pa!.name : '', sb.length === 0 ? pb!.name : ''].filter(Boolean).join(' and ')} has no senior stats to compare (junior seasons are not included).
          </p>
        )}

        {!ready ? (
          unknown.length === 0 && !same && <EmptyState>{copy.empty}</EmptyState>
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <SubHeading title={`${pa!.name} v ${pb!.name}`} />
              <p className="text-sm text-brand-grey">
                {common
                  ? shared.length > 0 ? `Only the ${shared.length} season${shared.length === 1 ? '' : 's'} both played.` : 'These two players have no season in common.'
                  : `Totals across every stored season (${since}).`}{' '}
                The ✓ marks the better value. Averages, strike rate and economy are only marked when both players meet the qualifying minimums.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={href(pb!.slug, pa!.slug)} className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60">
                  Swap players
                </Link>
                <ShareButton path={href(pa!.slug, pb!.slug)} title={`${pa!.name} v ${pb!.name}`} label="Share this comparison" tone="light" />
              </div>
            </div>
            <CompareTable
              rows={compareCounts(careerFor(pa!.id), careerFor(pb!.id), settings.qualification.career)}
              nameA={pa!.name}
              nameB={pb!.name}
              caption={`${common ? 'seasons both played' : since}. Better value marked with a tick.`}
            />
            <SeasonSplitTable rows={seasonSplit(sa, sb, only)} nameA={pa!.name} nameB={pb!.name} />
            <p className="text-sm text-brand-grey">
              <Link href={`/players/${pa!.slug}`} className="font-semibold text-brand-gold-deep underline underline-offset-2">{pa!.name}</Link>
              {' · '}
              <Link href={`/players/${pb!.slug}`} className="font-semibold text-brand-gold-deep underline underline-offset-2">{pb!.name}</Link>
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
