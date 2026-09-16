/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils'

export type Sponsor = {
  id: number
  tier: string
  name: string
  logoUrl: string
  linkUrl: string
}

export const TIER_ORDER = ['Platinum', 'Gold', 'Silver', 'Bronze', 'Player'] as const
export const TIERS: readonly string[] = TIER_ORDER

export const TIER_STYLES: Record<
  string,
  { grid: string; logo: string; card: string; badge: string; blurb: string }
> = {
  Platinum: {
    grid: 'grid-cols-1 sm:grid-cols-2',
    logo: 'h-28 sm:h-36',
    card: 'p-10 rounded-3xl',
    badge: 'bg-brand-black text-brand-gold',
    blurb: 'Our principal partner.',
  },
  Gold: {
    grid: 'grid-cols-2 md:grid-cols-3',
    logo: 'h-20 sm:h-24',
    card: 'p-8 rounded-2xl',
    badge: 'bg-brand-gold text-brand-black',
    blurb: 'Major supporters of the club.',
  },
  Silver: {
    grid: 'grid-cols-2 md:grid-cols-4',
    logo: 'h-14 sm:h-16',
    card: 'p-6 rounded-xl',
    badge: 'bg-brand-stone text-brand-black ring-1 ring-brand-black/10',
    blurb: 'Backing the club season to season.',
  },
  Bronze: {
    grid: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-6',
    logo: 'h-10 sm:h-12',
    card: 'p-4 rounded-lg',
    badge: 'bg-brand-gold-pale text-brand-gold-deep',
    blurb: 'Local businesses in our corner.',
  },
  Player: {
    grid: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-6',
    logo: 'h-10 sm:h-12',
    card: 'p-4 rounded-lg',
    badge: 'bg-brand-ink text-white',
    blurb: 'Getting individual players onto the park.',
  },
}

/** Logo image, or the sponsor name as text when no logo has been uploaded yet. */
function SponsorMark({ sponsor, className }: { sponsor: Sponsor; className: string }) {
  if (!sponsor.logoUrl) {
    return (
      <span className={cn('flex items-center text-center text-sm font-semibold text-brand-black', className)}>
        {sponsor.name}
      </span>
    )
  }
  return (
    <img
      src={sponsor.logoUrl}
      alt={`${sponsor.name} logo`}
      loading="lazy"
      className={cn('w-auto max-w-full object-contain', className)}
    />
  )
}

export function groupByTier(rows: Sponsor[]) {
  return TIER_ORDER.map((tier) => ({ tier, items: rows.filter((s) => s.tier === tier) })).filter(
    (g) => g.items.length > 0
  )
}

export function SponsorCard({ sponsor, tier }: { sponsor: Sponsor; tier: string }) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.Bronze
  const img = <SponsorMark sponsor={sponsor} className={style.logo} />
  const base = cn(
    'flex items-center justify-center bg-white shadow-card ring-1 ring-brand-black/5 transition',
    style.card
  )
  if (sponsor.linkUrl) {
    return (
      <a
        href={sponsor.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={sponsor.name}
        aria-label={`${sponsor.name} (opens in a new tab)`}
        className={cn(base, 'hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand-gold/60')}
      >
        {img}
      </a>
    )
  }
  return (
    <div title={sponsor.name} className={base}>
      {img}
    </div>
  )
}

/** Compact, single-row logo strip used on the home page. */
export function SponsorStrip({ sponsors, className }: { sponsors: Sponsor[]; className?: string }) {
  // A business can sponsor at more than one tier; show its logo once, at its highest tier.
  const seen = new Set<string>()
  const ordered = groupByTier(sponsors)
    .flatMap((g) => g.items)
    .filter((s) => {
      const key = s.name.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-10 gap-y-6', className)}>
      {ordered.map((s) => {
        const img = (
          <SponsorMark
            sponsor={s}
            className={cn(
              'max-w-[160px] opacity-80 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0',
              s.tier === 'Platinum' ? 'h-16 sm:h-20' : s.tier === 'Gold' ? 'h-12 sm:h-14' : 'h-9 sm:h-10'
            )}
          />
        )
        return s.linkUrl ? (
          <a
            key={s.id}
            href={s.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={s.name}
            aria-label={`${s.name} (opens in a new tab)`}
            className="group inline-flex min-h-11 items-center rounded-md px-1"
          >
            {img}
          </a>
        ) : (
          <span
            key={s.id}
            title={s.name}
            className="group inline-flex min-h-11 items-center px-1"
          >
            {img}
          </span>
        )
      })}
    </div>
  )
}
