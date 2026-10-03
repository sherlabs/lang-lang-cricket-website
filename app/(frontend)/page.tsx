import { JsonLd } from '@/components/json-ld'
import { organizationJsonLd } from '@/lib/structured-data'
import { canonicalFor } from '@/lib/site-metadata'
import Image from 'next/image'
import { ClubLogo } from '@/components/club-logo'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, Mail01Icon } from '@hugeicons/core-free-icons'
import { cookies } from 'next/headers'
import { ApparelBanner } from '@/components/apparel-link'
import { SectionHeading } from '@/components/section-heading'
import { PeopleGrid } from '@/components/person-card'
import { SponsorStrip } from '@/components/sponsor-logos'
import { SponsorCarousel, selectCarouselSponsors } from '@/components/sponsor-carousel'
import { AnnouncementBanner } from '@/components/announcement-banner'
import { getSponsorCarouselTiers } from '@/lib/site-settings'
import { listGalleryPhotos, listSponsors } from '@/lib/content-queries'
import { listPeople } from '@/lib/people-queries'
import { getClub } from '@/lib/club'
import { clubIcon } from '@/lib/club-icons'
import { getLatestAnnouncement } from '@/lib/announcements-queries'
import { ANNOUNCEMENT_DISMISS_COOKIE, excerpt, shouldShowBanner } from '@/lib/announcements-format'

export const metadata = { alternates: canonicalFor('/') }

// Reads the announcement-dismissed cookie, so this page is per-request anyway.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [club, sponsorRows, allContacts, photos, carouselTiers, latestAnnouncement] = await Promise.all([
    getClub(),
    listSponsors(),
    listPeople(),
    listGalleryPhotos(6),
    getSponsorCarouselTiers(),
    getLatestAnnouncement(),
  ])
  const { hero, highlights, about, galleryTeaser, committee, sponsors, joinCta } = club.home
  // Leadership and junior coaches have their own sections on /people; the home page shows the committee only.
  const contacts = allContacts.filter((c) => c.section === 'committee')
  const carouselSponsors = selectCarouselSponsors(sponsorRows, carouselTiers)
  // Decided server-side so a dismissed banner never flashes before hiding.
  const dismissedId = (await cookies()).get(ANNOUNCEMENT_DISMISS_COOKIE)?.value
  const showBanner = latestAnnouncement !== null && shouldShowBanner(latestAnnouncement.id, dismissedId)

  return (
    <main>
      <JsonLd data={organizationJsonLd(club)} />
      {/* Latest announcement (dismissable, per announcement) */}
      {showBanner && latestAnnouncement && (
        <AnnouncementBanner
          id={latestAnnouncement.id}
          title={latestAnnouncement.title}
          excerpt={excerpt(latestAnnouncement.body)}
        />
      )}

      {/* Hero */}
      <section className="relative isolate min-h-[560px] overflow-hidden bg-brand-black text-white sm:min-h-[640px] lg:min-h-[700px]">
        <Image
          src={club.assets.heroImage}
          alt={hero.imageAlt}
          fill
          priority
          sizes="100vw"
          // Tailwind needs a literal class; any other focal point goes inline.
          className={hero.focalY === 60 ? 'object-cover object-[center_60%]' : 'object-cover'}
          style={hero.focalY === 60 ? undefined : { objectPosition: `center ${hero.focalY}%` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-black/90 via-brand-black/60 to-brand-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/80 via-transparent to-transparent" />

        <div className="container-site relative flex min-h-[560px] flex-col justify-end pb-16 pt-24 sm:min-h-[640px] sm:pb-24 lg:min-h-[700px]">
          <div className="mb-6 inline-flex w-fit items-center gap-3 rounded-full bg-white/10 py-1.5 pl-1.5 pr-4 text-xs font-medium backdrop-blur">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white p-0.5">
              <ClubLogo src={club.logoUrl} alt="" width={20} height={25} className="h-5 w-auto" />
            </span>
            {hero.eyebrow}
          </div>
          <h1 className="display max-w-4xl text-balance text-6xl sm:text-7xl lg:text-8xl">
            {hero.headline} <span className="text-brand-gold">{hero.headlineAccent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80 sm:text-xl">{hero.intro}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a
              href={`mailto:${club.email}`}
              className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-5 py-3 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
            >
              <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4" aria-hidden />
              {hero.primaryCta.label}
            </a>
            <Link
              href={hero.secondaryCta.href}
              className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:border-brand-gold hover:text-brand-gold"
            >
              {hero.secondaryCta.label}
              <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Club apparel call-to-action (nothing when no shop link is set) */}
      <ApparelBanner apparel={club.apparel} />

      {/* Sponsor logo carousel (tiers chosen in admin) */}
      <SponsorCarousel sponsors={carouselSponsors} />

      {/* About */}
      <section className="container-site grid gap-12 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-20 lg:py-28">
        <div>
          <SectionHeading eyebrow={about.eyebrow} title={about.title} intro={about.intro} />
          <p className="mt-5 max-w-2xl leading-relaxed text-brand-grey">{about.body}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {about.links.map((link, i) =>
              i === 0 ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-2 rounded-md bg-brand-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-charcoal"
                >
                  {link.label}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
                </Link>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-2 rounded-md border border-brand-black/15 px-4 py-2.5 text-sm font-semibold text-brand-black transition hover:border-brand-gold hover:bg-brand-gold-pale"
                >
                  {link.label}
                </Link>
              ),
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {highlights.map((h) => (
            <div
              key={h.title}
              className="group rounded-2xl bg-brand-stone p-6 ring-1 ring-brand-black/5 transition hover:bg-brand-gold-pale hover:ring-brand-gold/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30 transition group-hover:bg-brand-gold group-hover:text-brand-black group-hover:ring-brand-gold">
                <HugeiconsIcon icon={clubIcon(h.icon)} className="h-5 w-5" aria-hidden />
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
                <p className="eyebrow text-brand-gold">{galleryTeaser.eyebrow}</p>
                <h2 className="display mt-3 text-balance text-4xl sm:text-5xl">{galleryTeaser.title}</h2>
              </div>
              <Link
                href="/gallery"
                className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand-gold transition hover:text-brand-gold-light"
              >
                {galleryTeaser.ctaLabel}
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
                      alt={p.caption || club.name}
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
            <SectionHeading eyebrow={committee.eyebrow} title={committee.title} intro={committee.intro} />
            <Link
              href="/contact"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md text-sm font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4 transition hover:text-brand-gold-deep"
            >
              {committee.ctaLabel}
              <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <PeopleGrid people={contacts} className="mt-12" />
        </div>
      </section>

      {/* Sponsors */}
      {sponsorRows.length > 0 && (
        <section className="container-site py-20 lg:py-28">
          <SectionHeading align="center" eyebrow={sponsors.eyebrow} title={sponsors.title} intro={sponsors.intro} />
          <SponsorStrip sponsors={sponsorRows} className="mt-12" />
          <div className="mt-10 text-center">
            <Link
              href="/sponsors"
              className="inline-flex items-center gap-2 rounded-md border border-brand-black/15 px-4 py-2.5 text-sm font-semibold text-brand-black transition hover:border-brand-gold hover:bg-brand-gold-pale"
            >
              {sponsors.ctaLabel}
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
              <p className="eyebrow text-brand-gold">{joinCta.eyebrow}</p>
              <h2 className="display mt-3 text-balance text-4xl sm:text-5xl">{joinCta.title}</h2>
              <p className="mt-4 text-white/80">{joinCta.intro}</p>
            </div>
            <a
              href={`mailto:${club.email}`}
              className="inline-flex w-fit max-w-full items-center gap-2 rounded-md bg-brand-gold px-5 py-3 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
            >
              <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4 shrink-0" aria-hidden />
              <span className="break-all">{club.email}</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
