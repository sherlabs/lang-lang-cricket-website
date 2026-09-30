import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getAdminEventById } from '../actions'
import { listRsvpsForEvent, deleteRsvp } from '../rsvp-actions'
import { listEventPhotos, listPendingEventPhotos, removeEventPhoto } from '../photo-actions'
import { PendingPhotoCard } from './pending-photos'
import { getOneTimeEventDateTime, nowAsEventClock } from '@/lib/event-occurrences'
import { formatLongDate, formatUtcDate } from '@/lib/events-format'
import { RecapUploader } from './recap-uploader'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, EmptyState } from '@/components/admin/admin-card'
import { ConfirmDelete } from '@/components/admin/row-actions'
import { RsvpTallyBar } from '@/components/events/rsvp-tally'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { EventRsvp } from '@/db/schema'
import type { RsvpTally } from '@/lib/rsvp-response'

export const dynamic = 'force-dynamic'

type Occurrence = {
  date: Date
  going: EventRsvp[]
  notGoing: EventRsvp[]
  tally: RsvpTally
  /** Dinner type → count, insertion-ordered by first appearance. */
  meals: Map<string, number>
  noDinner: number
}

/** One group per occurrence date, in date order (rows arrive sorted by occurrenceDate). */
function groupByOccurrence(rsvps: EventRsvp[]): Occurrence[] {
  const groups = new Map<string, Occurrence>()
  for (const r of rsvps) {
    const key = r.occurrenceDate.toISOString()
    let g = groups.get(key)
    if (!g) {
      g = { date: r.occurrenceDate, going: [], notGoing: [], tally: { yes: 0, no: 0 }, meals: new Map(), noDinner: 0 }
      groups.set(key, g)
    }
    if (r.response === 'no') {
      g.notGoing.push(r)
      g.tally.no++
    } else {
      g.going.push(r)
      g.tally.yes++
      const meal = r.meal ?? ''
      if (meal) g.meals.set(meal, (g.meals.get(meal) ?? 0) + 1)
      else g.noDinner++
    }
  }
  return [...groups.values()]
}

function RsvpTable({ rows, showMeal }: { rows: EventRsvp[]; showMeal: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-5 sm:pl-6">Date</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          {showMeal && <TableHead>Dinner</TableHead>}
          <TableHead>Note</TableHead>
          <TableHead className="pr-5 text-right sm:pr-6">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} className="border-brand-black/5">
            <TableCell className="pl-5 sm:pl-6">{formatUtcDate(r.occurrenceDate)}</TableCell>
            <TableCell className="font-medium text-brand-black">{r.name}</TableCell>
            <TableCell className="text-brand-grey">{r.email || '—'}</TableCell>
            {showMeal && <TableCell className="text-brand-grey">{r.meal || <span className="text-brand-grey-light">No dinner</span>}</TableCell>}
            <TableCell className="text-brand-grey">{r.note || '—'}</TableCell>
            <TableCell className="pr-5 text-right sm:pr-6">
              <ConfirmDelete name={r.name} action={deleteRsvp.bind(null, r.id)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function OccurrenceCard({ occurrence, hasMealOptions }: { occurrence: Occurrence; hasMealOptions: boolean }) {
  const dinners = [...occurrence.meals.values()].reduce((a, b) => a + b, 0)
  const showMeal = hasMealOptions || dinners > 0
  return (
    <AdminCard
      title={formatLongDate(occurrence.date, true)}
      aside={<span className="text-sm text-brand-grey">{occurrence.tally.yes + occurrence.tally.no} responses</span>}
      flush
      className="mb-8"
    >
      <div className="border-b border-brand-black/5 px-5 py-4 sm:px-6">
        <RsvpTallyBar tally={occurrence.tally} className="max-w-md" />
        {showMeal && (
          <p className="mt-3 text-sm text-brand-grey">
            <span className="font-semibold text-brand-black">Dinners: {dinners}</span>
            {dinners > 0 && (
              <>
                {' '}
                ({[...occurrence.meals.entries()].map(([meal, n]) => `${meal} ${n}`).join(' · ')})
              </>
            )}
            <span className="mx-1.5 text-brand-grey-light" aria-hidden>
              ·
            </span>
            No dinner: {occurrence.noDinner}
          </p>
        )}
      </div>

      <h3 className="border-b border-brand-black/5 bg-brand-stone/40 px-5 py-2.5 text-sm font-semibold text-brand-black sm:px-6">
        Going ({occurrence.going.length})
      </h3>
      {occurrence.going.length === 0 ? <EmptyState>No one has said yes yet.</EmptyState> : <RsvpTable rows={occurrence.going} showMeal={showMeal} />}

      <h3 className="border-y border-brand-black/5 bg-brand-stone/40 px-5 py-2.5 text-sm font-semibold text-brand-black sm:px-6">
        Can&apos;t make it ({occurrence.notGoing.length})
      </h3>
      {occurrence.notGoing.length === 0 ? <EmptyState>No one has said no.</EmptyState> : <RsvpTable rows={occurrence.notGoing} showMeal={false} />}
    </AdminCard>
  )
}

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  noStore()
  const id = Number(params.id)
  const event = await getAdminEventById(id)
  if (!event) notFound()

  const [rsvps, allPhotos, pending] = await Promise.all([listRsvpsForEvent(id), listEventPhotos(id), listPendingEventPhotos(id)])
  // listEventPhotos returns every row; pending submissions get their own queue below.
  const photos = allPhotos.filter((p) => p.status === 'approved')
  const occurrences = groupByOccurrence(rsvps)
  const hasMealOptions = Array.isArray(event.mealOptions) && event.mealOptions.length > 0

  const isPastOneTime =
    event.type === 'one_time' && !!event.eventDate && getOneTimeEventDateTime({ eventDate: event.eventDate, eventTime: event.eventTime }) < nowAsEventClock()

  return (
    <main>
      <AdminPageHeader eyebrow="Events" title={event.title} />

      {occurrences.length === 0 ? (
        <AdminCard title="RSVPs" aside={<span className="text-sm text-brand-grey">0 total</span>} flush className="mb-8">
          <EmptyState>No RSVPs yet.</EmptyState>
        </AdminCard>
      ) : (
        occurrences.map((occurrence) => (
          <OccurrenceCard key={occurrence.date.toISOString()} occurrence={occurrence} hasMealOptions={hasMealOptions} />
        ))
      )}

      {/* Shown whenever a queue could exist (past one-time) or does exist (e.g. the event's date was later edited). */}
      {(isPastOneTime || pending.length > 0) && (
        <AdminCard
          title="Pending photos"
          description="Submitted by the public from the event page. Approve to publish, reject to delete."
          aside={<span className="text-sm text-brand-grey">{pending.length} waiting</span>}
          flush={pending.length === 0}
          className="mb-8"
        >
          {pending.length === 0 ? (
            <EmptyState>No photos waiting for review.</EmptyState>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pending.map((p) => (
                <PendingPhotoCard key={p.id} photo={p} />
              ))}
            </ul>
          )}
        </AdminCard>
      )}

      {isPastOneTime && (
        <AdminCard title="Recap photos" className="mb-8">
          <RecapUploader eventId={id} />
          {photos.length > 0 && (
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((p) => (
                <li key={p.id} className="group relative overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                  <div className="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100">
                    <ConfirmDelete name="this photo" action={removeEventPhoto.bind(null, p.id)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      )}
    </main>
  )
}
