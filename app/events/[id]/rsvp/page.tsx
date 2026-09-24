/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, Clock01Icon, Location01Icon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { DateTile } from '@/components/events/date-tile'
import { buttonVariants } from '@/components/ui/button'
import { getEventById } from '@/lib/events-queries'
import { formatLongDate } from '@/lib/events-format'
import { formatLocalTime } from '@/lib/playhq/format'
import type { Event } from '@/db/schema'
import { RsvpForm } from './rsvp-form'

export const dynamic = 'force-dynamic'

type Props = {
  params: { id: string }
  searchParams: { [key: string]: string | string[] | undefined }
}

async function loadEvent(id: string): Promise<Event | null> {
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) return null
  return getEventById(numericId)
}

export async function generateMetadata({ params }: Props) {
  const event = await loadEvent(params.id)
  return { title: event ? `RSVP: ${event.title} | Lang Lang Cricket Club` : 'RSVP | Lang Lang Cricket Club' }
}

/** The session being RSVP'd to — stays put beside the form so the date is never out of sight. */
function OccurrenceCard({ event, occurrenceDate }: { event: Event; occurrenceDate: Date }) {
  const time = formatLocalTime(event.eventTime)
  return (
    <aside className="self-start overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 lg:sticky lg:top-24">
      {event.coverImageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-brand-stone">
          <img src={event.coverImageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey-light">You&apos;re RSVPing for</p>
        <div className="mt-4 flex items-start gap-4">
          <DateTile date={occurrenceDate} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">
              {formatLongDate(occurrenceDate, true)}
            </p>
            <h2 className="font-heading mt-1 text-xl font-bold leading-tight tracking-tight text-brand-black">
              {event.title}
            </h2>
          </div>
        </div>

        {(time || event.location) && (
          <ul className="mt-5 space-y-2 border-t border-brand-black/5 pt-5 text-sm text-brand-grey">
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

        <Link
          href="/events"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-black underline-offset-4 hover:underline"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
          {event.type === 'recurring' ? 'Pick a different date' : 'Back to all events'}
        </Link>
      </div>
    </aside>
  )
}

/** Reached without a usable `?date=` — the link was hand-typed or truncated, so send them back to choose a session. */
function MissingDate({ event }: { event: Event }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-card ring-1 ring-brand-black/5">
      <p className="eyebrow">Pick a date first</p>
      <h2 className="font-heading mt-3 text-2xl font-bold tracking-tight text-brand-black">Which session are you coming to?</h2>
      <p className="mt-3 text-sm leading-relaxed text-brand-grey">
        This link doesn&apos;t say which date you&apos;re RSVPing for. Head back to the events page and choose the{' '}
        <span className="font-semibold text-brand-black">{event.title}</span> session you&apos;re coming to.
      </p>
      <Link href="/events" className={buttonVariants({ variant: 'brand', size: 'xl', className: 'mt-6 gap-2' })}>
        <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
        Back to events
      </Link>
    </div>
  )
}

export default async function RsvpPage({ params, searchParams }: Props) {
  // See app/events/page.tsx — noStore() keeps the Neon fetch out of Next's fetch cache.
  noStore()
  const event = await loadEvent(params.id)
  if (!event) notFound()

  const rawDate = searchParams.date
  const dateParam = Array.isArray(rawDate) ? rawDate[0] : rawDate
  // Passed through untouched as the hidden field so submitRsvp validates exactly what was linked to.
  const occurrenceIso = dateParam?.trim() ?? ''
  const occurrenceDate = occurrenceIso ? new Date(occurrenceIso) : null
  const validDate = occurrenceDate && !Number.isNaN(occurrenceDate.getTime()) ? occurrenceDate : null

  return (
    <main>
      <PageHeader
        eyebrow="RSVP"
        title={event.title}
        intro="Let us know you're coming so we can plan the numbers. It only takes a moment, and you'll get a link to change or cancel later."
      />

      <section className="bg-brand-stone/60">
        <div className="container-site py-12 lg:py-16">
          {validDate ? (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
              <OccurrenceCard event={event} occurrenceDate={validDate} />
              <RsvpForm
                eventId={event.id}
                eventTitle={event.title}
                occurrenceIso={occurrenceIso}
                occurrenceLabel={formatLongDate(validDate)}
              />
            </div>
          ) : (
            <MissingDate event={event} />
          )}
        </div>
      </section>
    </main>
  )
}
