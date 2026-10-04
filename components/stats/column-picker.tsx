import { GROUP_LABELS, GROUPS, LAB_COLUMNS } from '@/lib/stats/statlab-columns'
import { MAX_COLUMNS, type StatLabParams } from '@/lib/stats/statlab'

/**
 * Column checkboxes with a minimum-value box per stat, grouped by discipline. Plain form
 * controls inside a GET form, so it works with no JavaScript. Counts above `MAX_COLUMNS` are
 * trimmed by the parser, which the hint says.
 */
export function ColumnPicker({ params }: { params: StatLabParams }) {
  return (
    <fieldset className="space-y-5">
      <legend className="eyebrow">Columns and minimums</legend>
      <p className="text-sm text-brand-grey">Tick up to {MAX_COLUMNS} stats. A minimum hides players below it (leave blank for none). Columns marked &ldquo;match data&rdquo; switch the table to stored match data.</p>
      {GROUPS.map((g) => {
        const metrics = LAB_COLUMNS.filter((m) => m.group === g)
        if (!metrics.length) return null
        return (
          <div key={g}>
            <p className="text-sm font-bold text-brand-charcoal">{GROUP_LABELS[g]}</p>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map((m) => (
                <li key={m.key} className="flex min-h-11 items-center justify-between gap-3">
                  <label className="flex min-w-0 items-center gap-2 text-sm text-brand-black">
                    <input type="checkbox" name="cols" value={m.key} defaultChecked={params.cols.includes(m.key)} className="h-4 w-4 shrink-0 accent-brand-gold" />
                    <span className="min-w-0">
                      <span className="truncate">{m.label}</span>
                      {m.matchOnly && <span className="ml-1.5 rounded-full bg-brand-gold-pale px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-gold-deep">match data</span>}
                      {m.help && <span className="block text-xs text-brand-grey">{m.help}</span>}
                    </span>
                  </label>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <label htmlFor={`min-${m.key}`} className="text-xs text-brand-grey">Min<span className="sr-only"> {m.label}</span></label>
                    <input
                      id={`min-${m.key}`}
                      name={`min.${m.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      defaultValue={params.mins[m.key] ?? ''}
                      className="min-h-11 w-20 rounded-md border border-brand-black/15 bg-white px-2 text-sm tabular-nums text-brand-black"
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </fieldset>
  )
}
