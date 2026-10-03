import Link from 'next/link'
import { GROUP_LABELS, GROUPS, leaderboardMetrics, type MetricGroup } from '@/lib/stats/metrics'
import { ALL, statsHref, type StatsParams } from '@/lib/stats/query-string'
import { cn } from '@/lib/utils'

const selectClass = 'min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black'
const pillBase = 'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition'
const pill = (active: boolean) =>
  cn(pillBase, active ? 'bg-brand-black text-white' : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60')

/**
 * Leaderboard filters. A plain GET form, so it works without JavaScript: season, grade and the
 * junior toggle submit together. Group tabs and metric pills are links; below `sm` the metric
 * list is a native select inside the same form (with a visible Apply button) so nothing
 * overflows a 375px screen.
 */
export function FilterBar({
  params,
  seasons,
  grades,
  showJuniors,
}: {
  params: StatsParams
  seasons: string[]
  grades: string[]
  showJuniors: boolean
}) {
  const metrics = leaderboardMetrics(params.group)
  const base = { season: params.season, grade: params.grade, cats: params.cats ?? undefined, juniors: params.juniors }
  return (
    <div className="space-y-5">
      <nav aria-label="Stat groups" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          {GROUPS.map((g: MetricGroup) => (
            <li key={g}>
              <Link
                href={statsHref('/stats', { ...base, metric: leaderboardMetrics(g)[0].key })}
                aria-current={g === params.group ? 'page' : undefined}
                className={pill(g === params.group)}
              >
                {GROUP_LABELS[g]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form method="get" action="/stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
        <input type="hidden" name="group" value={params.group} />
        {params.cats && <input type="hidden" name="cat" value={params.cats.join(',')} />}
        <div>
          <label htmlFor="stats-season" className="eyebrow">Season</label>
          <select id="stats-season" name="season" defaultValue={params.season} className={cn(selectClass, 'mt-2')}>
            <option value={ALL}>All seasons (combined)</option>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="stats-grade" className="eyebrow">Grade</label>
          <select id="stats-grade" name="grade" defaultValue={params.grade} className={cn(selectClass, 'mt-2')}>
            <option value={ALL}>All grades</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {showJuniors && (
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-black">
            <input type="checkbox" name="juniors" value="1" defaultChecked={params.juniors} className="h-4 w-4 accent-brand-gold" />
            Include juniors
          </label>
        )}
        <div className="sm:hidden">
          <label htmlFor="stats-metric" className="eyebrow">Stat</label>
          <select id="stats-metric" name="metric" defaultValue={params.metricGiven ? params.metric : ''} className={cn(selectClass, 'mt-2')}>
            <option value="">Overview (top 10 of each)</option>
            {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-md bg-brand-black px-5 text-sm font-semibold text-white transition hover:bg-brand-charcoal">
          Apply
        </button>
      </form>

      {metrics.length > 1 && (
        <nav aria-label="Stat" className="hidden sm:block">
          <ul className="flex flex-wrap gap-2">
            {metrics.map((m) => {
              const active = params.metricGiven && m.key === params.metric
              return (
                <li key={m.key}>
                  <Link href={statsHref('/stats', { ...base, metric: m.key })} aria-current={active ? 'page' : undefined} className={pill(active)}>
                    {m.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}
