import { JsonLd } from '@/components/json-ld'
import { eventJsonLd } from '@/lib/structured-data'
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { cookies } from 'next/headers'
import { ArrowLeft01Icon, Calendar03Icon, Clock01Icon, Location01Icon, RepeatIcon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { DateTile } from '@/components/events/date-tile'
import { EventPlaceholderArt } from '@/components/events/event-placeholder-art'
import { getDeviceRsvp, getEventById, getEventPhotosPublic, getRsvpTally, listUpcomingItems } from '@/lib/events-queries'
import { getOneTimeEventDateTime, nowAsEventClock } from '@/lib/event-occurrences'
import { formatLongDate, DAYS } from '@/lib/events-format'
import { formatLocalTime } from '@/lib/playhq/format'
import { RSVP_COOKIE, parseRsvpCookie } from '@/lib/rsvp-cookie'
import { isRsvpResponse } from '@/lib/rsvp-response'
import type { Event } from '@/db/schema'
import { baseOpenGraph, truncateDescription, canonicalFor, titleWithSuffix } from "@/lib/site-metadata"
import { getClub } from '@/lib/club'
import { PhotoSubmitForm } from './photo-submit-form'
import { RsvpPanel } from './rsvp-panel'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }>; searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

async function loadEvent(id: string): Promise<Event | null> {
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) return null
  return getEventById(numericId)
}

/** When/where summary first, then the admin-written blurb, trimmed for link previews. */
function eventDescription(event: Event, clubName: string): string {
  const when =
    event.type === 'recurring' && event.dayOfWeek != null
      ? `Every ${DAYS[event.dayOfWeek]}`
      : event.eventDate
        ? formatLongDate(event.eventDate, true)
        : ''
  const time = formatLocalTime(event.eventTime)
  const parts = [[when, time].filter(Boolean).join(' · '), event.location && `at ${event.location}`].filter(Boolean)
  const where = parts.join(' ')
  const summary = where ? `${where}.` : ''
  return truncateDescription([summary, event.description].filter(Boolean).join(' ') || `A ${clubName} event.`)
}

export async function generateMetadata(props: Props) {
  const params = await props.params;
  const [club, event] = await Promise.all([getClub(), loadEvent(params.id)])
  return {
    alternates: canonicalFor(`/events/${params.id}`),
    title: titleWithSuffix(club, event ? event.title : 'Event not found'),
    description: event ? eventDescription(event, club.name) : undefined,
    openGraph: event?.coverImageUrl
      ? { ...baseOpenGraph(club), images: [{ url: event.coverImageUrl, alt: event.title }] }
      : baseOpenGraph(club),
  }
}

/** Same rule as submitEventPhoto — if this says "past", the form's action will accept the photo. */
function isPastOneTime(event: Event): event is Event & { eventDate: Date } {
  return (
    event.type === 'one_time' &&
    !!event.eventDate &&
    getOneTimeEventDateTime({ eventDate: event.eventDate, eventTime: event.eventTime }) < nowAsEventClock()
  )
}

export default async function EventDetailPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const [club, event] = await Promise.all([getClub(), loadEvent(params.id)])
  if (!event) notFound()

  const past = isPastOneTime(event)
  // The next occurrence (one-time date, or next weekly session) — same window
  // and rule as the Upcoming list, so the RSVP link here matches the card's.
  const upcoming = past ? null : (await listUpcomingItems()).find((item) => item.event.id === event.id) ?? null
  const photos = past ? await getEventPhotosPublic(event.id) : []

  // The occurrence the poll is about: the next one, or the (past) date itself for a closed poll.
  const pollDate = past ? getOneTimeEventDateTime({ eventDate: event.eventDate, eventTime: event.eventTime }) : upcoming?.occurrenceDate ?? null
  const memory = parseRsvpCookie((await cookies()).get(RSVP_COOKIE)?.value)
  const [tally, mine] = pollDate
    ? await Promise.all([getRsvpTally(event.id, pollDate), past ? null : getDeviceRsvp(memory, event.id, pollDate)])
    : [null, null]
  const confirmedResponse = first(searchParams?.rsvp)
  // Only shown when this device really has an RSVP — a typed-in `?rsvp=yes` is not a confirmation.
  const confirmation = mine && isRsvpResponse(confirmedResponse) ? { response: confirmedResponse, pay: first(searchParams?.pay) === '1' } : null

  const time = formatLocalTime(event.eventTime)
  const isRecurring = event.type === 'recurring' && event.dayOfWeek != null
  const headlineDate = past ? event.eventDate : upcoming?.occurrenceDate ?? null

  return (
    <main>
      <JsonLd data={eventJsonLd(event, pollDate, club)} />
      <PageHeader
        eyebrow={past ? 'Past event' : isRecurring ? 'Every ' + DAYS[event.dayOfWeek!] : 'Event'}
        title={event.title}
        intro={headlineDate ? formatLongDate(headlineDate, true) + (time ? ` · ${time}` : '') : undefined}
      >
        <Link
          href="/events"
          className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-gold-light underline-offset-4 hover:underline"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
          All events
        </Link>
      </PageHeader>

      <section className="bg-brand-stone/60">
        <div className="container-site py-12 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            {/* Details card — sticky on desktop so the date/RSVP stay in view beside a long photo grid. */}
            <aside className="self-start overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 lg:sticky lg:top-24">
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-brand-black">
                {event.coverImageUrl ? (
                  <img src={event.coverImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <EventPlaceholderArt seed={event.id} />
                )}
                {isRecurring && (
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-brand-black/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold-light backdrop-blur">
                    <HugeiconsIcon icon={RepeatIcon} className="h-3 w-3" aria-hidden />
                    Every {DAYS[event.dayOfWeek!]}
                  </span>
                )}
              </div>

              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  {headlineDate ? (
                    <DateTile date={headlineDate} />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-stone text-brand-grey ring-1 ring-brand-black/5" aria-hidden>
                      <HugeiconsIcon icon={Calendar03Icon} className="h-6 w-6" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">
                      {past ? 'Happened on' : upcoming ? (isRecurring ? 'Next session' : 'Coming up') : 'No upcoming dates'}
                    </p>
                    <p className="font-heading mt-1 text-lg font-bold leading-tight tracking-tight text-brand-black">
                      {headlineDate ? formatLongDate(headlineDate, true) : isRecurring ? `${DAYS[event.dayOfWeek!]}s` : 'Date to be confirmed'}
                    </p>
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

                {pollDate && tally && (
                  <RsvpPanel
                    eventId={event.id}
                    occurrenceDate={pollDate}
                    tally={tally}
                    mine={mine?.response ?? null}
                    closed={past}
                    confirmation={confirmation}
                    paymentUrl={event.paymentLinkUrl}
                    paymentLabel={event.paymentLinkLabel}
                  />
                )}
              </div>
            </aside>

            <div className="flex flex-col gap-8">
              {event.description ? (
                <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 sm:p-8">
                  <h2 className="display text-2xl text-brand-black">About this event</h2>
                  <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-brand-charcoal">{event.description}</p>
                </div>
              ) : (
                !past && (
                  <p className="rounded-2xl bg-white px-6 py-10 text-center text-sm text-brand-grey shadow-card ring-1 ring-brand-black/5">
                    More details to come. RSVP to let us know you&apos;re in.
                  </p>
                )
              )}

              {past && (
                <>
                  <div>
                    <div className="mb-5 flex items-center gap-3">
                      <h2 className="display text-2xl text-brand-black">Photos</h2>
                      {photos.length > 0 && (
                        <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">
                          {photos.length}
                        </span>
                      )}
                      <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
                    </div>
                    {photos.length === 0 ? (
                      <p className="rounded-2xl bg-white px-6 py-10 text-center text-sm text-brand-grey shadow-card ring-1 ring-brand-black/5">
                        No photos yet — got one from the day? Add it below.
                      </p>
                    ) : (
                      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {photos.map((photo, i) => (
                          <li key={`${photo.url}-${i}`} className="overflow-hidden rounded-xl bg-brand-stone ring-1 ring-brand-black/5">
                            <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
                              <img
                                src={photo.url}
                                alt={`${event.title} photo ${i + 1}`}
                                loading={i < 6 ? 'eager' : 'lazy'}
                                className="aspect-square h-full w-full object-cover transition duration-300 hover:scale-105"
                              />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <PhotoSubmitForm eventId={event.id} />
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
