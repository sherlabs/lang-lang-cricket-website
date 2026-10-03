import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon } from '@hugeicons/core-free-icons'
import { getClub } from '@/lib/club'
import { listSponsors } from '@/lib/content-queries'
import { PageHeader } from '@/components/page-header'
import { SponsorCard, TIER_STYLES, groupByTier } from '@/components/sponsor-logos'
import { cn } from '@/lib/utils'
import { canonicalFor, pageSeo } from "@/lib/site-metadata"

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { alternates: canonicalFor('/sponsors'), ...pageSeo(await getClub(), 'sponsors') }
}

export default async function SponsorsPage() {
  const [club, rows] = await Promise.all([getClub(), listSponsors()])
  const groups = groupByTier(rows)
  const copy = club.pageCopy.sponsors
  const blurbs = new Map(club.pageCopy.tierBlurbs.map((t) => [t.tier, t.blurb]))
  const subject = encodeURIComponent(club.sponsorshipSubject)

  return (
    <main>
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />

      <section className="container-site space-y-20 py-16 lg:py-24">
        {groups.length === 0 && (
          <p className="rounded-xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">
            {club.pageCopy.emptyStates.sponsors}
          </p>
        )}
        {groups.map(({ tier, items }) => {
          const style = TIER_STYLES[tier] ?? TIER_STYLES.Bronze
          return (
            <section key={tier} aria-labelledby={`tier-${tier}`}>
              <div className="mb-8 flex flex-wrap items-center gap-4">
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]',
                    style.badge
                  )}
                >
                  {tier}
                </span>
                <h2 id={`tier-${tier}`} className="display text-3xl text-brand-black sm:text-4xl">
                  {tier} {items.length === 1 ? 'sponsor' : 'sponsors'}
                </h2>
                <span className="hidden text-sm text-brand-grey sm:inline">{blurbs.get(tier) ?? ''}</span>
                <span className="ml-auto hidden h-px flex-1 bg-brand-black/10 sm:block" />
              </div>
              <div className={cn('grid gap-5', style.grid)}>
                {items.map((s) => (
                  <SponsorCard key={s.id} sponsor={s} tier={tier} />
                ))}
              </div>
            </section>
          )
        })}

        <div className="relative overflow-hidden rounded-3xl bg-brand-black px-8 py-14 text-white sm:px-14 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-gold/20 blur-3xl"
          />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow text-brand-gold">{copy.cta.eyebrow}</p>
              <h2 className="display mt-3 text-balance text-4xl sm:text-5xl">{copy.cta.title}</h2>
              <p className="mt-4 text-white/80">{copy.cta.intro}</p>
            </div>
            <a
              href={`mailto:${club.email}?subject=${subject}`}
              className="inline-flex w-fit items-center gap-2 rounded-md bg-brand-gold px-5 py-3 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
            >
              <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4" aria-hidden />
              {copy.cta.ctaLabel}
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
