/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  Clock01Icon,
  ExternalLinkIcon,
  Location01Icon,
  RepeatIcon,
} from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DateTile } from '@/components/events/date-tile'
import { getEventPhotosPublic, listPastOneTimeEvents, listUpcomingItems } from '@/lib/events-queries'
import { formatLongDate } from '@/lib/events-format'
import { formatLocalTime } from '@/lib/playhq/format'
import type { Event } from '@/db/schema'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Events | Lang Lang Cricket Club',
  description: 'Upcoming club events, training, and how to RSVP.',
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function SectionRule({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-8 flex items-center gap-3">
      <h2 className="display text-2xl text-brand-black">{title}</h2>
      {count != null && count > 0 && (
        <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">
          {count}
        </span>
      )}
      <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
    </div>
  )
}

function UpcomingCard({ event, occurrenceDate }: { event: Event; occurrenceDate: Date }) {
  const time = formatLocalTime(event.eventTime)
  const hasPayment = Boolean(event.paymentLinkLabel && event.paymentLinkUrl)
  const rsvpHref = `/events/${event.id}/rsvp?date=${encodeURIComponent(occurrenceDate.toISOString())}`

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 transition hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand-gold/40">
      {event.coverImageUrl && (
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-stone">
          <img
            src={event.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
          {event.type === 'recurring' && event.dayOfWeek != null && (
            <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-brand-black/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold-light backdrop-blur">
              <HugeiconsIcon icon={RepeatIcon} className="h-3 w-3" aria-hidden />
              Every {DAYS[event.dayOfWeek]}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex-1">
          <div className="flex items-start gap-4">
            <DateTile date={occurrenceDate} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">
                {formatLongDate(occurrenceDate)}
              </p>
              <h3 className="font-heading mt-1 text-xl font-bold leading-tight tracking-tight text-brand-black">
                {event.title}
              </h3>
              {!event.coverImageUrl && event.type === 'recurring' && event.dayOfWeek != null && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-stone px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey">
                  <HugeiconsIcon icon={RepeatIcon} className="h-3 w-3" aria-hidden />
                  Every {DAYS[event.dayOfWeek]}
                </span>
              )}
            </div>
          </div>

          {(time || event.location) && (
            <ul className="mt-4 space-y-1.5 text-sm text-brand-grey">
              {time && (
                <li className="flex items-center gap-2">
                  <HugeiconsIcon icon={Clock01Icon} className="h-4 w-4 shrink-0 text-brand-gold-deep" aria-hidden />
                  <span>{time}</span>
                </li>
              )}
              {event.location && (
                <li className="flex items-start gap-2">
                  <HugeiconsIcon icon={Location01Icon} className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold-deep" aria-hidden />
                  <span>{event.location}</span>
                </li>
              )}
            </ul>
          )}

          {event.description && (
            <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-brand-grey">{event.description}</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-brand-black/5 pt-5">
          <Link
            href={rsvpHref}
            className={buttonVariants({ variant: 'brand', size: 'xl', className: 'flex-1 gap-2' })}
          >
            RSVP
            <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
          </Link>
          {hasPayment && (
            <a
              href={event.paymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'gold', size: 'xl', className: 'flex-1 gap-2' })}
            >
              {event.paymentLinkLabel}
              <HugeiconsIcon icon={ExternalLinkIcon} className="h-4 w-4" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

function PastCard({ event, photos }: { event: Event; photos: { url: string }[] }) {
  if (!event.eventDate) return null
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
      <div className="flex items-center gap-4 p-5">
        <DateTile date={event.eventDate} size="sm" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-grey-light">
            {formatLongDate(event.eventDate, true)}
          </p>
          <h3 className="font-heading mt-0.5 text-lg font-bold leading-tight tracking-tight text-brand-black">
            {event.title}
          </h3>
        </div>
      </div>
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-1 px-5 pb-5 sm:grid-cols-4">
          {photos.map((photo, i) => (
            <li key={`${photo.url}-${i}`} className="overflow-hidden rounded-lg bg-brand-stone">
              <img
                src={photo.url}
                alt={`${event.title} photo ${i + 1}`}
                loading="lazy"
                className="aspect-square h-full w-full object-cover"
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

export default async function EventsPage() {
  // force-dynamic alone doesn't stop the Neon driver's fetch from being cached by
  // Next's fetch-cache layer — noStore() is required so a freshly created or
  // deleted event is never served stale here.
  noStore()
  const [upcoming, past] = await Promise.all([listUpcomingItems(), listPastOneTimeEvents()])
  const pastWithPhotos = await Promise.all(
    past.map(async (event) => ({ event, photos: await getEventPhotosPublic(event.id) }))
  )

  return (
    <main>
      <PageHeader
        eyebrow="Events"
        title="What's on at the club"
        intro="Training nights, presentation dinners, fundraisers and family days. Let us know you're coming so we can plan the numbers."
      />

      <section className="container-site py-16 lg:py-20">
        <SectionRule title="Upcoming" count={upcoming.length} />
        {upcoming.length === 0 ? (
          <p className="rounded-2xl bg-brand-stone px-6 py-12 text-center text-sm text-brand-grey">
            Nothing on the calendar just yet. Check back soon, or follow the club on social media for the latest.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map(({ event, occurrenceDate }) => (
              <UpcomingCard key={`${event.id}-${occurrenceDate.toISOString()}`} event={event} occurrenceDate={occurrenceDate} />
            ))}
          </div>
        )}
      </section>

      {pastWithPhotos.length > 0 && (
        <section className="bg-brand-stone/60">
          <div className="container-site py-16 lg:py-20">
            <SectionRule title="Past events" />
            <div className="grid items-start gap-5 sm:grid-cols-2">
              {pastWithPhotos.map(({ event, photos }) => (
                <PastCard key={event.id} event={event} photos={photos} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
