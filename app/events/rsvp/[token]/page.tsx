/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, Clock01Icon, Location01Icon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { DateTile } from '@/components/events/date-tile'
import { getEventById } from '@/lib/events-queries'
import { formatLongDate } from '@/lib/events-format'
import { formatLocalTime } from '@/lib/playhq/format'
import type { Event, EventRsvp } from '@/db/schema'
import { getRsvpByToken } from './actions'
import { RsvpEditForm } from './rsvp-edit-form'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Your RSVP | Lang Lang Cricket Club' }

/**
 * The session this RSVP is for. `event` is null when the admin has since deleted the event —
 * the RSVP row still stands on its own (stored occurrence date), so we show that and say so.
 */
function OccurrenceCard({ event, rsvp }: { event: Event | null; rsvp: EventRsvp }) {
  const time = event ? formatLocalTime(event.eventTime) : null
  return (
    <aside className="self-start overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 lg:sticky lg:top-24">
      {event?.coverImageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-brand-stone">
          <img src={event.coverImageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey-light">You&apos;re RSVP&apos;d for</p>
        <div className="mt-4 flex items-start gap-4">
          <DateTile date={rsvp.occurrenceDate} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">
              {formatLongDate(rsvp.occurrenceDate, true)}
            </p>
            <h2 className="font-heading mt-1 text-xl font-bold leading-tight tracking-tight text-brand-black">
              {event ? event.title : 'This event is no longer listed'}
            </h2>
          </div>
        </div>

        {event ? (
          (time || event.location) && (
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
          )
        ) : (
          <p className="mt-5 border-t border-brand-black/5 pt-5 text-sm leading-relaxed text-brand-grey">
            The club has taken this event off the calendar. Your RSVP is still on file — you can update it or cancel it
            here, or check the events page for what&apos;s coming up.
          </p>
        )}

        <Link
          href="/events"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-black underline-offset-4 hover:underline"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
          Back to all events
        </Link>
      </div>
    </aside>
  )
}

export default async function RsvpEditPage({ params }: { params: { token: string } }) {
  // See app/events/page.tsx — noStore() keeps the Neon fetch out of Next's fetch cache.
  noStore()
  const rsvp = await getRsvpByToken(params.token)
  if (!rsvp) notFound()

  const event = await getEventById(rsvp.eventId)

  return (
    <main>
      <PageHeader
        eyebrow="Your RSVP"
        title="Manage your RSVP"
        intro="Plans changed? Update your details below, or let us know you can't make it any more. Changes save straight away."
      />

      <section className="bg-brand-stone/60">
        <div className="container-site py-12 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            <OccurrenceCard event={event} rsvp={rsvp} />
            <RsvpEditForm
              token={rsvp.editToken}
              initialName={rsvp.name}
              initialEmail={rsvp.email}
              initialNote={rsvp.note}
              eventTitle={event?.title ?? null}
              occurrenceLabel={formatLongDate(rsvp.occurrenceDate)}
            />
          </div>
        </div>
      </section>
    </main>
  )
}
