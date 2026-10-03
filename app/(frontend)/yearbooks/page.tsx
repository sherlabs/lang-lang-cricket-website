/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { EmptyState } from '@/components/stats/sub-heading'
import { getClub } from '@/lib/club'
import { canonicalFor, pageSeo } from '@/lib/site-metadata'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { listPublishedYearbooks } from '@/lib/yearbooks-queries'

// Same rendering mode as every stats route (ISR, 900s); the yearbooks hooks revalidate this path on publish.
export const revalidate = 900

export async function generateMetadata() {
  return { alternates: canonicalFor('/yearbooks'), ...pageSeo(await getClub(), 'yearbooks') }
}

export default async function YearbooksPage() {
  const [club, books] = await Promise.all([getClub(), listPublishedYearbooks()])
  const copy = club.pageCopy.yearbooks

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Yearbooks', href: '/yearbooks' }], club)} />
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
      <section className="container-site space-y-8 py-12 lg:py-16">
        <StatsSubNav current="/yearbooks" />
        {books.length === 0 ? (
          <EmptyState>{copy.empty}</EmptyState>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/yearbooks/${b.slug}`}
                  className="group block overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 transition hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand-gold/60"
                >
                  {b.coverUrl ? (
                    <img src={b.coverUrl} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" />
                  ) : (
                    <div aria-hidden className="flex aspect-[3/2] items-center justify-center bg-brand-black">
                      <span className="display text-5xl text-brand-gold">{b.seasonName.replace(/^[A-Za-z]+\s+/, '')}</span>
                    </div>
                  )}
                  <div className="p-5">
                    <p className="eyebrow">{b.seasonName}</p>
                    <h2 className="display mt-2 text-2xl text-brand-black group-hover:text-brand-gold-deep">{b.title}</h2>
                    {b.premiership && <p className="mt-2 text-sm font-semibold text-brand-charcoal">{b.premiership}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
