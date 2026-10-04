import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, MapPinIcon, ShieldCheckIcon } from '@hugeicons/core-free-icons'
import { FacebookIcon } from '@/components/icons'
import { getClub } from '@/lib/club'
import { listPeople } from '@/lib/people-queries'
import { PageHeader } from '@/components/page-header'
import { PeopleGrid } from '@/components/person-card'
import { SectionHeading } from '@/components/section-heading'
import { canonicalFor, pageSeo } from "@/lib/site-metadata"

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { alternates: canonicalFor('/contact'), ...pageSeo(await getClub(), 'contact') }
}

export default async function ContactPage() {
  // Junior coaches are listed on /people only; the contact page keeps the committee and leadership.
  const [club, all] = await Promise.all([getClub(), listPeople()])
  const copy = club.pageCopy.contact
  const cards = club.pageCopy.contactCards
  const note = club.pageCopy.safeguardingNote
  const social = club.socials[0]
  const contacts = all.filter((c) => c.section === 'committee')
  const leadership = all.filter((c) => c.section === 'leadership')

  return (
    <main>
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />

      <section className="container-site relative z-10 -mt-8 grid gap-4 sm:grid-cols-3" aria-label="Quick contact details">
        <a
          href={`mailto:${club.email}`}
          className="group rounded-2xl bg-brand-gold p-6 text-brand-black shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
        >
          <HugeiconsIcon icon={Mail01Icon} className="h-6 w-6" aria-hidden />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-black/75">{cards.emailLabel}</p>
          <p className="mt-1 break-all font-bold underline decoration-brand-black/0 decoration-2 underline-offset-4 transition group-hover:decoration-brand-black">{club.email}</p>
        </a>
        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5">
          <HugeiconsIcon icon={MapPinIcon} className="h-6 w-6 text-brand-gold-deep" aria-hidden />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-grey-light">{cards.homeGroundLabel}</p>
          <p className="mt-1 font-bold text-brand-black">{club.tagline}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5">
          <FacebookIcon className="h-6 w-6 text-brand-gold-deep" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-grey-light">{cards.socialLabel}</p>
          <p className="mt-1 font-bold text-brand-black">
            {social?.url ? (
              <a href={social.url} target="_blank" rel="noopener noreferrer" className="underline decoration-brand-gold decoration-2 underline-offset-4">
                {social.label}
              </a>
            ) : (
              social?.label
            )}
          </p>
          <p className="mt-1 text-sm text-brand-grey">{cards.socialNote}</p>
        </div>
      </section>

      <section className="container-site py-20 lg:py-24">
        <SectionHeading eyebrow={copy.committee.eyebrow} title={copy.committee.title} intro={copy.committee.intro} />
        <p className="mt-4 text-sm text-brand-grey">
          Looking for our junior coaches? Everyone involved in running the club is listed on the{' '}
          <Link href="/people" className="font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4 transition hover:text-brand-gold-deep">
            Our People
          </Link>{' '}
          page.
        </p>
        <PeopleGrid people={contacts} className="mt-12" />

        {leadership.length > 0 && (
          <div className="mt-20">
            <SectionHeading eyebrow={copy.leadership.eyebrow} title={copy.leadership.title} intro={copy.leadership.intro} />
            <PeopleGrid people={leadership} className="mt-12" />
          </div>
        )}

        <div className="mt-8 flex items-start gap-3 rounded-2xl bg-brand-gold-pale p-5 text-sm text-brand-charcoal ring-1 ring-brand-gold/30">
          <HugeiconsIcon icon={ShieldCheckIcon} className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold-deep" aria-hidden />
          <p>
            {note.text}{' '}
            <Link href={note.linkHref} className="font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4 transition hover:text-brand-gold-deep">
              {note.linkLabel}
            </Link>{' '}
            {note.after}
          </p>
        </div>
      </section>

      <section className="bg-brand-cream py-20 lg:py-24">
        <div className="container-site grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <SectionHeading eyebrow={copy.findUs.eyebrow} title={club.tagline} intro={copy.findUs.intro} />
          <div className="overflow-hidden rounded-3xl bg-brand-stone shadow-card ring-1 ring-brand-black/5">
            <iframe
              title={`Map of ${club.tagline}`}
              src={`https://www.google.com/maps?${new URLSearchParams({ q: club.mapQuery, z: '12', output: 'embed' })}`}
              width="100%"
              height="380"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              className="block h-[380px] w-full border-0"
            />
          </div>
        </div>
      </section>
    </main>
  )
}
