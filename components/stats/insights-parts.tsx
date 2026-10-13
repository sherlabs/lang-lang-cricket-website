import Link from 'next/link'
import { insightsPaths } from '@/config/site'
import { insightsHref, type InsightsParams } from '@/lib/insights/params'
import { ALL } from '@/lib/stats/query-string'
import { cn } from '@/lib/utils'

const selectClass = 'min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black'

/** The two Insights views as links (not a tablist: there are no panels). A third view may be added beside them later. */
export function InsightsTabs({ current, params }: { current: 'team' | 'trends'; params: InsightsParams }) {
  const tabs = [
    { key: 'team', label: 'Team analysis', href: insightsHref(insightsPaths.team, params) },
    { key: 'trends', label: 'Trends', href: insightsHref(insightsPaths.trends, params) },
  ] as const
  return (
    <nav aria-label="Insights views" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full px-4 py-1.5 text-sm font-semibold transition',
                t.key === current ? 'bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/40' : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60',
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Season and grade as one plain GET form, so it works without JavaScript. */
export function InsightsFilters({ action, params, seasons, grades }: { action: string; params: InsightsParams; seasons: readonly string[]; grades: readonly string[] }) {
  return (
    <form method="get" action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
      <div>
        <label htmlFor="ins-season" className="eyebrow">Season</label>
        <select id="ins-season" name="season" defaultValue={params.season} className={cn(selectClass, 'mt-2')}>
          <option value={ALL}>All seasons (combined)</option>
          {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="ins-grade" className="eyebrow">Grade</label>
        <select id="ins-grade" name="grade" defaultValue={params.grade} className={cn(selectClass, 'mt-2')}>
          <option value={ALL}>All grades</option>
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <button type="submit" className="min-h-11 rounded-md bg-brand-black px-5 text-sm font-semibold text-white hover:bg-brand-charcoal">Apply</button>
    </form>
  )
}

/** One figure with the sample behind it. `value` is already formatted; a missing figure reads "n/a" with the reason in `note`. */
export function Tiles({ items }: { items: readonly { label: string; value: string; note?: string }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-brand-grey">{it.label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-brand-black">{it.value}</dd>
          {it.note && <dd className="mt-0.5 text-xs text-brand-grey">{it.note}</dd>}
        </div>
      ))}
    </dl>
  )
}
