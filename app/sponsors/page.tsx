import { Mail } from 'lucide-react'
import { db } from '@/db'
import { sponsors } from '@/db/schema'
import { PageHeader } from '@/components/page-header'
import { SponsorCard, TIER_STYLES, groupByTier } from '@/components/sponsor-logos'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Sponsors | Lang Lang Cricket Club',
}

export default async function SponsorsPage() {
  const rows = await db.select().from(sponsors)
  const groups = groupByTier(rows)

  return (
    <main>
      <PageHeader
        eyebrow="Sponsors & partners"
        title="The businesses behind the club"
        intro="From the pavilion lights to junior kit, our sponsors make the season possible. Please support them where you can."
      />

      <section className="container-site space-y-20 py-16 lg:py-24">
        {groups.length === 0 && (
          <p className="text-sm text-neutral-500">Sponsor details will be published soon.</p>
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
                <h2 id={`tier-${tier}`} className="text-2xl font-bold tracking-tight text-brand-black">
                  {tier} {items.length === 1 ? 'sponsor' : 'sponsors'}
                </h2>
                <span className="hidden text-sm text-neutral-500 sm:inline">{style.blurb}</span>
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

        <div className="rounded-3xl bg-brand-black px-8 py-12 text-white sm:px-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow text-brand-gold">Become a sponsor</p>
              <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight">
                Put your business in front of the local community.
              </h2>
              <p className="mt-3 text-white/70">
                Sponsorship packages are available at every tier. Drop the committee a line to find out
                more.
              </p>
            </div>
            <a
              href="mailto:langlangcricketclub@gmail.com?subject=Sponsorship%20enquiry"
              className="inline-flex w-fit items-center gap-2 rounded-md bg-brand-gold px-5 py-3 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
            >
              <Mail className="h-4 w-4" aria-hidden />
              Enquire about sponsorship
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
