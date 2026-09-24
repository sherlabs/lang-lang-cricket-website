import { dateTileParts } from '@/lib/events-format'

/** Calendar-leaf date block used on every event card so the eye can scan dates down a grid. */
export function DateTile({ date, size = 'md' }: { date: Date; size?: 'md' | 'sm' }) {
  const { day, month } = dateTileParts(date)
  const md = size === 'md'
  return (
    <div
      aria-hidden
      className={
        md
          ? 'flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-gold-pale py-2.5 ring-1 ring-brand-gold/30'
          : 'flex w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-stone py-1.5 ring-1 ring-brand-black/5'
      }
    >
      <span className={md ? 'display text-3xl text-brand-black' : 'display text-xl text-brand-black'}>{day}</span>
      <span className={md ? 'mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold-deep' : 'mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-grey'}>
        {month}
      </span>
    </div>
  )
}
