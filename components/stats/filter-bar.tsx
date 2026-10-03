import { CategoryChecks } from '@/components/stats/category-checks'
import type { GradeCategory } from '@/lib/stats/categories'
import { GROUP_LABELS, GROUPS, leaderboardMetrics, type MetricGroup } from '@/lib/stats/metrics'
import { ALL, type StatsParams } from '@/lib/stats/query-string'
import { cn } from '@/lib/utils'

const selectClass = 'min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black'
const pillBase = 'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition'
const pill = (active: boolean) =>
  cn(pillBase, active ? 'bg-brand-black text-white' : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60')

/**
 * Leaderboard filters as ONE plain GET form, so it works without JavaScript and a stat or group
 * pill never drops an unapplied season or grade choice: the pills are submit buttons that send
 * the whole form with their own `metric`. Pills come first in the DOM, so when one is pressed its
 * `metric` is the first value the server reads and wins over the phone-only select. Below `sm`
 * the metric list is that select (with the Apply button); the pills are `hidden` there.
 */
export function FilterBar({
  params,
  seasons,
  grades,
  categories,
  selected,
}: {
  params: StatsParams
  seasons: string[]
  grades: string[]
  categories: GradeCategory[]
  selected: GradeCategory[]
}) {
  const metrics = leaderboardMetrics(params.group)
  return (
    <form method="get" action="/stats" className="flex flex-col gap-5">
      {/* DOM order matters (see above); `order-*` puts them back in reading order. */}
      <nav aria-label="Stat groups" className="order-1 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          {GROUPS.map((g: MetricGroup) => (
            <li key={g}>
              <button
                type="submit"
                name="metric"
                value={leaderboardMetrics(g)[0].key}
                aria-current={g === params.group ? 'page' : undefined}
                className={pill(g === params.group)}
              >
                {GROUP_LABELS[g]}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {metrics.length > 1 && (
        <nav aria-label="Stat" className="order-3 hidden sm:block">
          <ul className="flex flex-wrap gap-2">
            {metrics.map((m) => {
              const active = params.metricGiven && m.key === params.metric
              return (
                <li key={m.key}>
                  <button type="submit" name="metric" value={m.key} aria-current={active ? 'page' : undefined} className={pill(active)}>
                    {m.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      <div className="order-2 space-y-4">
        <input type="hidden" name="group" value={params.group} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
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
          <div className="sm:hidden">
            <label htmlFor="stats-metric" className="eyebrow">Stat</label>
            <select id="stats-metric" name="metric" defaultValue={params.metricGiven ? params.metric : ''} className={cn(selectClass, 'mt-2')}>
              <option value="">Overview (top 10 of each)</option>
              {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <CategoryChecks categories={categories} selected={selected} />
        <button type="submit" className="min-h-11 rounded-md bg-brand-black px-5 text-sm font-semibold text-white transition hover:bg-brand-charcoal">
          Apply
        </button>
      </div>
    </form>
  )
}
