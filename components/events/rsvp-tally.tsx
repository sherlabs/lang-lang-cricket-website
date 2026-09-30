import type { RsvpTally } from '@/lib/rsvp-response'
import { cn } from '@/lib/utils'

/** "3 going · 1 can't make it" — shared wording for public and admin. */
export function tallyText(tally: RsvpTally): string {
  const going = `${tally.yes} going`
  const no = `${tally.no} can't make it`
  return `${going} · ${no}`
}

/**
 * Counts plus a proportional bar (yes = brand gold, no = muted). Server-safe, no
 * hooks. The bar is decorative — the sentence above it is the text equivalent.
 */
export function RsvpTallyBar({ tally, className, muted }: { tally: RsvpTally; className?: string; muted?: boolean }) {
  const total = tally.yes + tally.no
  const yesPct = total === 0 ? 0 : Math.round((tally.yes / total) * 100)
  return (
    <div className={className}>
      <p className={cn('text-sm tabular-nums', muted ? 'text-brand-grey' : 'text-brand-charcoal')}>
        <span className="font-semibold text-brand-black">{tally.yes}</span> going
        <span className="mx-1.5 text-brand-grey-light" aria-hidden>
          ·
        </span>
        <span className="font-semibold text-brand-black">{tally.no}</span> can&apos;t make it
      </p>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-brand-black/10" aria-hidden>
        {total > 0 && (
          <>
            <span className="h-full bg-brand-gold transition-[width] duration-300" style={{ width: `${yesPct}%` }} />
            <span className="h-full flex-1 bg-brand-grey-light/40" />
          </>
        )}
      </div>
    </div>
  )
}
