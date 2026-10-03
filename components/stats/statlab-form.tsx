import { ColumnPicker } from '@/components/stats/column-picker'
import { METRICS } from '@/lib/stats/metrics'
import { ALL } from '@/lib/stats/query-string'
import { SCOPES, SCOPE_LABELS, type StatLabParams } from '@/lib/stats/statlab'
import { cn } from '@/lib/utils'

const selectClass = 'mt-2 min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black'

/** The StatLab controls as one GET form: every choice lands in the URL, which is the saved report. */
export function StatLabForm({
  params,
  seasons,
  grades,
  showJuniors,
}: {
  params: StatLabParams
  seasons: string[]
  grades: string[]
  showJuniors: boolean
}) {
  const sortKey = `${params.sort.key}.${params.sort.dir}`
  return (
    <form method="get" action="/statlab" className="space-y-6 rounded-2xl bg-white p-5 shadow-card ring-1 ring-brand-black/5 sm:p-6">
      {params.cats && <input type="hidden" name="cat" value={params.cats.join(',')} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="lab-scope" className="eyebrow">Rows</label>
          <select id="lab-scope" name="scope" defaultValue={params.scope} className={selectClass}>
            {SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="lab-season" className="eyebrow">Season</label>
          <select id="lab-season" name="season" defaultValue={params.season} className={selectClass}>
            <option value={ALL}>All seasons</option>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="lab-grade" className="eyebrow">Grade</label>
          <select id="lab-grade" name="grade" defaultValue={params.grade} className={selectClass}>
            <option value={ALL}>All grades</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="lab-q" className="eyebrow">Player name</label>
          <input id="lab-q" name="q" type="search" maxLength={80} defaultValue={params.q} placeholder="Search" className={cn(selectClass, 'placeholder:text-brand-grey-light')} />
        </div>
        <div>
          <label htmlFor="lab-sort" className="eyebrow">Sort by</label>
          <select id="lab-sort" name="sort" defaultValue={sortKey} className={selectClass}>
            <option value="name.asc">Player name (A to Z)</option>
            {METRICS.flatMap((m) => [
              <option key={`${m.key}.desc`} value={`${m.key}.desc`}>{m.label} (high to low)</option>,
              <option key={`${m.key}.asc`} value={`${m.key}.asc`}>{m.label} (low to high)</option>,
            ])}
          </select>
        </div>
        <div>
          <label htmlFor="lab-maxseasons" className="eyebrow">Seasons played, at most</label>
          <input id="lab-maxseasons" name="maxseasons" type="number" min={1} max={50} defaultValue={params.maxSeasons ?? ''} className={selectClass} />
        </div>
        <div className="flex flex-col justify-end gap-1">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-black">
            <input type="checkbox" name="active" value="1" defaultChecked={params.active} className="h-4 w-4 accent-brand-gold" />
            Active players only
          </label>
          {showJuniors && (
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-black">
              <input type="checkbox" name="juniors" value="1" defaultChecked={params.juniors} className="h-4 w-4 accent-brand-gold" />
              Include juniors
            </label>
          )}
        </div>
      </div>

      <details open className="group">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-gold-deep hover:text-brand-black">Choose columns</summary>
        <div className="mt-3"><ColumnPicker params={params} /></div>
      </details>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="min-h-11 rounded-md bg-brand-black px-5 text-sm font-semibold text-white transition hover:bg-brand-charcoal">Build table</button>
        <a href="/statlab" className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-brand-grey underline underline-offset-2 hover:text-brand-black">Reset</a>
      </div>
    </form>
  )
}
