import { CATEGORY_LABELS, type GradeCategory } from '@/lib/stats/categories'

/**
 * Which grade categories to count: one checkbox per category the club actually has. Submits as
 * repeated `cat=` values (the parsers accept repeats and comma lists). Renders nothing when the
 * club has a single category, since there is nothing to choose.
 */
export function CategoryChecks({ categories, selected }: { categories: readonly GradeCategory[]; selected: readonly GradeCategory[] }) {
  if (categories.length < 2) return null
  return (
    <fieldset className="min-w-0">
      <legend className="eyebrow">Count these grades</legend>
      <div className="mt-1 flex flex-wrap gap-x-5">
        {categories.map((c) => (
          <label key={c} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-black">
            <input type="checkbox" name="cat" value={c} defaultChecked={selected.includes(c)} className="h-4 w-4 accent-brand-gold" />
            {CATEGORY_LABELS[c]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
