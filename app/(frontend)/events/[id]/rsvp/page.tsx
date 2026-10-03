/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, Clock01Icon, Location01Icon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { DateTile } from '@/components/events/date-tile'
import { buttonVariants } from '@/components/ui/button'
import { getDeviceRsvp, getEventById, listUpcomingItems } from '@/lib/events-queries'
import { eventMealOptions } from '@/lib/events-meal'
import { formatLongDate } from '@/lib/events-format'
import { formatLocalTime } from '@/lib/playhq/format'
import { RSVP_COOKIE, parseRsvpCookie } from '@/lib/rsvp-cookie'
import type { Event } from '@/db/schema'
import { baseOpenGraph } from "@/lib/site-metadata"
import { RsvpForm } from './rsvp-form'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function loadEvent(id: string): Promise<Event | null> {
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) return null
  return getEventById(numericId)
}

export async function generateMetadata(props: Props) {
  const params = await props.params;
  const event = await loadEvent(params.id)
  if (!event) return { title: 'Event not found | Lang Lang Cricket Club', robots: { index: false, follow: true } }
  return {
    robots: { index: false, follow: true },
    title: `RSVP: ${event.title} | Lang Lang Cricket Club`,
    description: `Let Lang Lang Cricket Club know whether you're coming to ${event.title}.`,
    openGraph: event.coverImageUrl
      ? { ...baseOpenGraph, images: [{ url: event.coverImageUrl, alt: event.title }] }
      : baseOpenGraph,
  }
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
          href={`/events/${event.id}`}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-black underline-offset-4 hover:underline"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
          Back to the event
        </Link>
      </div>
    </aside>
  )
}

/** No upcoming date to RSVP for (the series has ended, or the one-time date has passed). */
function NoDate({ event }: { event: Event }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-card ring-1 ring-brand-black/5">
      <p className="eyebrow">RSVPs closed</p>
      <h2 className="font-heading mt-3 text-2xl font-bold tracking-tight text-brand-black">There&apos;s no upcoming date for this event</h2>
      <p className="mt-3 text-sm leading-relaxed text-brand-grey">
        <span className="font-semibold text-brand-black">{event.title}</span> has no sessions open for RSVP right now. Check the
        events page for what&apos;s coming up.
      </p>
      <Link href="/events" className={buttonVariants({ variant: 'brand', size: 'xl', className: 'mt-6 gap-2' })}>
        <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
        Back to events
      </Link>
    </div>
  )
}

export default async function RsvpPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const event = await loadEvent(params.id)
  if (!event) notFound()

  const rawDate = searchParams.date
  const dateParam = (Array.isArray(rawDate) ? rawDate[0] : rawDate)?.trim() ?? ''
  const parsed = dateParam ? new Date(dateParam) : null
  // A usable `?date=` wins; otherwise fall back to the next occurrence so a bare
  // /events/[id]/rsvp link still works. submitRsvp validates whichever we picked.
  let occurrenceDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
  if (!occurrenceDate) {
    occurrenceDate = (await listUpcomingItems()).find((item) => item.event.id === event.id)?.occurrenceDate ?? null
  }

  const rawResponse = searchParams.response
  const mode = (Array.isArray(rawResponse) ? rawResponse[0] : rawResponse) === 'no' ? 'no' : 'yes'

  const memory = parseRsvpCookie((await cookies()).get(RSVP_COOKIE)?.value)
  const mine = occurrenceDate ? await getDeviceRsvp(memory, event.id, occurrenceDate) : null

  return (
    <main>
      <PageHeader
        eyebrow="RSVP"
        title={event.title}
        intro={
          mode === 'no'
            ? "Sorry you can't make it — let us know so we can plan the numbers."
            : 'Let us know you’re coming so we can plan the numbers. It only takes a moment.'
        }
      />

      <section className="bg-brand-stone/60">
        <div className="container-site py-12 lg:py-16">
          {occurrenceDate ? (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
              <OccurrenceCard event={event} occurrenceDate={occurrenceDate} />
              <RsvpForm
                eventId={event.id}
                occurrenceIso={occurrenceDate.toISOString()}
                mode={mode}
                mealOptions={eventMealOptions(event)}
                paymentUrl={event.paymentLinkUrl}
                existing={mine !== null}
                initial={{
                  name: mine?.name ?? memory.name,
                  email: mine?.email ?? memory.email,
                  meal: mine?.meal ?? '',
                  note: mine?.note ?? '',
                }}
              />
            </div>
          ) : (
            <NoDate event={event} />
          )}
        </div>
      </section>
    </main>
  )
}
