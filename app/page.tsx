import Image from 'next/image'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  UserGroupIcon,
  TrophyIcon,
  ShieldCheckIcon,
  BankIcon,
  Mail01Icon,
} from '@hugeicons/core-free-icons'
import { asc } from 'drizzle-orm'
import { db } from '@/db'
import { sponsors, committeeContacts, galleryPhotos } from '@/db/schema'
import { SectionHeading } from '@/components/section-heading'
import { CommitteeCards } from '@/components/committee-cards'
import { SponsorStrip } from '@/components/sponsor-logos'

export const dynamic = 'force-dynamic'

const highlights = [
  {
    icon: UserGroupIcon,
    title: 'Juniors and seniors',
    body: 'Teams for kids picking up a bat for the first time through to experienced senior cricketers.',
  },
  {
    icon: TrophyIcon,
    title: 'Everyone gets a game',
    body: 'A friendly, welcoming club where beginners and seasoned players train and play side by side.',
  },
  {
    icon: BankIcon,
    title: 'A modern home ground',
    body: 'Our Caldermeade facility was developed with support from Cardinia Shire Council and Community Bank Lang Lang.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Safe for young players',
    body: "We follow Cricket Australia's Safeguarding Children and Young People Framework and a Member Protection Policy.",
  },
]

export default async function HomePage() {
  const [sponsorRows, contacts, photos] = await Promise.all([
    db.select().from(sponsors),
    db.select().from(committeeContacts).orderBy(asc(committeeContacts.sortOrder)),
    db.select().from(galleryPhotos).orderBy(asc(galleryPhotos.sortOrder)).limit(6),
  ])

  return (
    <main>
      {/* Hero */}
      <section className="relative isolate min-h-[560px] overflow-hidden bg-brand-black text-white sm:min-h-[640px] lg:min-h-[700px]">
        <Image
          src="/assets/branding/hero.jpg"
          alt="The Lang Lang Cricket Club pavilion and oval at Caldermeade"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_60%]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-black/90 via-brand-black/60 to-brand-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/80 via-transparent to-transparent" />

        <div className="container-site relative flex min-h-[560px] flex-col justify-end pb-16 pt-24 sm:min-h-[640px] sm:pb-24 lg:min-h-[700px]">
          <div className="mb-6 inline-flex w-fit items-center gap-3 rounded-full bg-white/10 py-1.5 pl-1.5 pr-4 text-xs font-medium backdrop-blur">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white p-0.5">
              <Image src="/assets/branding/logo.png" alt="" width={20} height={25} className="h-5 w-auto" />
            </span>
            Junior &amp; senior cricket in Caldermeade, Victoria
          </div>
          <h1 className="display max-w-4xl text-balance text-6xl sm:text-7xl lg:text-8xl">
            Play your cricket <span className="text-brand-gold">with Lang Lang</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80 sm:text-xl">
            A community club with room for every player, from first-time juniors to seasoned seniors,
            based at a modern home ground in Caldermeade.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a
              href="mailto:langlangcricketclub@gmail.com"
              className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-5 py-3 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
            >
              <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4" aria-hidden />
              Get in touch
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:border-brand-gold hover:text-brand-gold"
            >
              Meet the committee
              <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="container-site grid gap-12 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-20 lg:py-28">
        <div>
          <SectionHeading
            eyebrow="About the club"
            title="Local cricket, played the right way."
            intro="Lang Lang Cricket Club fields junior and senior sides out of Caldermeade, in Victoria's south-east. We are a club built by volunteers and families, and we make a point of being welcoming whether you are learning the basics or have played for decades."
          />
          <p className="mt-5 max-w-2xl leading-relaxed text-brand-grey">
            Our home ground is a modern facility developed with support from Cardinia Shire Council and
            Bendigo Bank&apos;s Community Bank Lang Lang. Off the field, the club is committed to a safe
            and respectful environment for everyone: we follow Cricket Australia&apos;s Safeguarding Children
            and Young People Framework and a Member Protection Policy that sets clear standards for
            members, coaches and volunteers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/history"
              className="inline-flex items-center gap-2 rounded-md bg-brand-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-charcoal"
            >
              Our history
              <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/documents"
              className="inline-flex items-center gap-2 rounded-md border border-brand-black/15 px-4 py-2.5 text-sm font-semibold text-brand-black transition hover:border-brand-gold hover:bg-brand-gold-pale"
            >
              Policies &amp; documents
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {highlights.map((h) => (
            <div
              key={h.title}
              className="group rounded-2xl bg-brand-stone p-6 ring-1 ring-brand-black/5 transition hover:bg-brand-gold-pale hover:ring-brand-gold/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30 transition group-hover:bg-brand-gold group-hover:text-brand-black group-hover:ring-brand-gold">
                <HugeiconsIcon icon={h.icon} className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-bold tracking-tight text-brand-black">{h.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-brand-grey">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Gallery teaser */}
      {photos.length > 0 && (
        <section className="bg-brand-black py-20 text-white lg:py-28">
          <div className="container-site">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow text-brand-gold">Around the club</p>
                <h2 className="display mt-3 text-balance text-4xl sm:text-5xl">
                  Life at Lang Lang
                </h2>
              </div>
              <Link
                href="/gallery"
                className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand-gold transition hover:text-brand-gold-light"
              >
                View the full gallery
                <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              {photos.map((p, i) => (
                <li
                  key={p.id}
                  className={i === 0 ? 'col-span-2 row-span-2 sm:col-span-2 sm:row-span-2' : ''}
                >
                  <Link href="/gallery" className="group block overflow-hidden rounded-xl bg-brand-ink ring-1 ring-white/10 transition hover:ring-brand-gold/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption || 'Lang Lang Cricket Club'}
                      loading="lazy"
                      className="aspect-square h-full w-full object-cover opacity-95 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Committee */}
      <section className="bg-brand-cream py-20 lg:py-28">
        <div className="container-site">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              eyebrow="Committee"
              title="The people running the club"
              intro="Volunteers who keep the season ticking over. Reach out to any of them with questions about playing, coaching or helping out."
            />
            <Link
              href="/contact"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md text-sm font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4 transition hover:text-brand-gold-deep"
            >
              Contact page
              <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <CommitteeCards contacts={contacts} className="mt-12" />
        </div>
      </section>

      {/* Sponsors */}
      {sponsorRows.length > 0 && (
        <section className="container-site py-20 lg:py-28">
          <SectionHeading
            align="center"
            eyebrow="Our sponsors"
            title="Backed by local businesses"
            intro="The club is only possible thanks to the businesses that support us every season."
          />
          <SponsorStrip sponsors={sponsorRows} className="mt-12" />
          <div className="mt-10 text-center">
            <Link
              href="/sponsors"
              className="inline-flex items-center gap-2 rounded-md border border-brand-black/15 px-4 py-2.5 text-sm font-semibold text-brand-black transition hover:border-brand-gold hover:bg-brand-gold-pale"
            >
              See all sponsors
              <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container-site pb-4 pt-4">
        <div className="relative overflow-hidden rounded-3xl bg-brand-black px-8 py-14 text-white sm:px-14 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-gold/20 blur-3xl"
          />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow text-brand-gold">Join us</p>
              <h2 className="display mt-3 text-balance text-4xl sm:text-5xl">
                Keen to play, coach or volunteer?
              </h2>
              <p className="mt-4 text-white/80">
                Send the club an email and we will point you to the right person.
              </p>
            </div>
            <a
              href="mailto:langlangcricketclub@gmail.com"
              className="inline-flex w-fit max-w-full items-center gap-2 rounded-md bg-brand-gold px-5 py-3 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
            >
              <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4 shrink-0" aria-hidden />
              <span className="break-all">langlangcricketclub@gmail.com</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
