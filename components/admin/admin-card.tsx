import { cn } from '@/lib/utils'

type Props = {
  title?: string
  description?: React.ReactNode
  /** Right-aligned content in the card header (a count, a link). */
  aside?: React.ReactNode
  className?: string
  /** Remove body padding, e.g. for a full-bleed table. */
  flush?: boolean
  children: React.ReactNode
}

/** White surface used for forms, lists and stats — same card language as the public site. */
export function AdminCard({ title, description, aside, className, flush, children }: Props) {
  return (
    <section className={cn('overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5', className)}>
      {(title || aside) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-black/5 px-5 py-4 sm:px-6">
          <div>
            {title && <h2 className="text-lg font-semibold text-brand-black">{title}</h2>}
            {description && <p className="mt-1 text-sm text-brand-grey">{description}</p>}
          </div>
          {aside}
        </header>
      )}
      <div className={cn(!flush && 'p-5 sm:p-6')}>{children}</div>
    </section>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-brand-grey sm:px-6">{children}</p>
}

const badgeTones: Record<string, string> = {
  Platinum: 'bg-brand-black text-white',
  Gold: 'bg-brand-gold text-brand-black',
  Silver: 'bg-brand-stone text-brand-black ring-1 ring-brand-black/10',
  Bronze: 'bg-brand-gold-pale text-brand-gold-deep',
  Player: 'bg-brand-ink text-white',
}

/** Small label pill; sponsor tiers get their public-site colours, anything else is tonal gold. */
export function Badge({ children }: { children: string }) {
  const tone = badgeTones[children] ?? 'bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30'
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', tone)}>
      {children}
    </span>
  )
}
