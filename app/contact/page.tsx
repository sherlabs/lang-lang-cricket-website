import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { Mail, MapPin, ShieldCheck } from 'lucide-react'
import { FacebookIcon } from '@/components/icons'
import { db } from '@/db'
import { committeeContacts } from '@/db/schema'
import { PageHeader } from '@/components/page-header'
import { CommitteeCards } from '@/components/committee-cards'
import { SectionHeading } from '@/components/section-heading'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Contact | Lang Lang Cricket Club',
}

const CLUB_EMAIL = 'langlangcricketclub@gmail.com'

export default async function ContactPage() {
  const contacts = await db.select().from(committeeContacts).orderBy(asc(committeeContacts.sortOrder))

  return (
    <main>
      <PageHeader
        eyebrow="Contact"
        title="Get in touch with the club"
        intro="Questions about joining, junior registrations, coaching or sponsorship? Email the club or contact a committee member directly."
      />

      <section className="container-site relative z-10 -mt-8 grid gap-4 sm:grid-cols-3" aria-label="Quick contact details">
        <a
          href={`mailto:${CLUB_EMAIL}`}
          className="group rounded-2xl bg-brand-gold p-6 text-brand-black shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
        >
          <Mail className="h-6 w-6" aria-hidden />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-black/75">Email</p>
          <p className="mt-1 break-all font-bold underline decoration-brand-black/0 decoration-2 underline-offset-4 transition group-hover:decoration-brand-black">{CLUB_EMAIL}</p>
        </a>
        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5">
          <MapPin className="h-6 w-6 text-brand-gold-deep" aria-hidden />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-grey-light">Home ground</p>
          <p className="mt-1 font-bold text-brand-black">Caldermeade, Victoria</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5">
          <FacebookIcon className="h-6 w-6 text-brand-gold-deep" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-grey-light">Social</p>
          <p className="mt-1 font-bold text-brand-black">Find us on Facebook</p>
          <p className="mt-1 text-sm text-brand-grey">Match schedules, results and club news.</p>
        </div>
      </section>

      <section className="container-site py-20 lg:py-24">
        <SectionHeading
          eyebrow="Committee"
          title="Meet the committee"
          intro="The volunteers who run the club. Our Child Safety Officer is your first point of contact for any safeguarding concern."
        />
        <CommitteeCards contacts={contacts} className="mt-12" />

        <div className="mt-8 flex items-start gap-3 rounded-2xl bg-brand-gold-pale p-5 text-sm text-brand-charcoal ring-1 ring-brand-gold/30">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold-deep" aria-hidden />
          <p>
            Lang Lang Cricket Club follows Cricket Australia&apos;s Safeguarding Children and Young People
            Framework and a Member Protection Policy. Our policies and codes of conduct are available on
            the{' '}
            <Link href="/documents" className="font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4 transition hover:text-brand-gold-deep">
              Documents &amp; Policies
            </Link>{' '}
            page.
          </p>
        </div>
      </section>

      <section className="bg-brand-cream py-20 lg:py-24">
        <div className="container-site grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <SectionHeading
            eyebrow="Find us"
            title="Caldermeade, Victoria"
            intro="Our modern home ground in Caldermeade was developed with support from Cardinia Shire Council and Community Bank Lang Lang."
          />
          <div className="overflow-hidden rounded-3xl bg-brand-stone shadow-card ring-1 ring-brand-black/5">
            <iframe
              title="Map of Caldermeade, Victoria"
              src="https://www.google.com/maps?q=Caldermeade%2C+Victoria%2C+Australia&z=12&output=embed"
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
