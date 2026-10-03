import { ordinal, type Badge } from '@/lib/stats/rank'
import { cn } from '@/lib/utils'

const TONE: Record<Badge, string> = {
  gold: 'bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30',
  silver: 'bg-brand-stone text-brand-grey ring-1 ring-brand-black/10',
  bronze: 'bg-brand-charcoal text-white',
}

/**
 * Rank as a numeral inside a tinted circle. The numeral and its spoken ordinal carry the rank;
 * colour only decorates (one accent hue and its tints, DESIGN.md), so it never carries meaning alone.
 */
export function RankBadge({ rank, badge }: { rank: number; badge: Badge | null }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums',
        badge ? TONE[badge] : 'text-brand-grey',
      )}
    >
      <span aria-hidden>{rank}</span>
      <span className="sr-only">{ordinal(rank)}</span>
    </span>
  )
}
