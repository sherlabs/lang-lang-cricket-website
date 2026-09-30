'use client'

import { cn } from '@/lib/utils'

/** Big tappable radio pills — a fieldset so the group has one accessible name. */
export function ChoiceGroup({
  legend,
  name,
  options,
  value,
  onChange,
  columns = 2,
}: {
  legend: string
  name: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  columns?: 2 | 3
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-brand-black">{legend}</legend>
      <div className={cn('mt-2 grid gap-2', columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}>
        {options.map((o) => {
          const checked = value === o.value
          return (
            <label
              key={o.value}
              className={cn(
                'flex h-12 cursor-pointer items-center justify-center rounded-xl border px-4 text-base font-semibold transition',
                checked
                  ? 'border-brand-gold bg-brand-gold-pale text-brand-black ring-2 ring-brand-gold/50'
                  : 'border-brand-black/10 bg-white text-brand-charcoal hover:border-brand-gold/60'
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                required
                className="sr-only"
              />
              {o.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
