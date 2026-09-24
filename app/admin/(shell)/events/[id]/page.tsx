import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getAdminEventById } from '../actions'
import { listRsvpsForEvent, deleteRsvp } from '../rsvp-actions'
import { listEventPhotos, listPendingEventPhotos, removeEventPhoto } from '../photo-actions'
import { PendingPhotoCard } from './pending-photos'
import { getOneTimeEventDateTime, nowAsEventClock } from '@/lib/event-occurrences'
import { formatUtcDate } from '@/lib/events-format'
import { RecapUploader } from './recap-uploader'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, EmptyState } from '@/components/admin/admin-card'
import { ConfirmDelete } from '@/components/admin/row-actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  noStore()
  const id = Number(params.id)
  const event = await getAdminEventById(id)
  if (!event) notFound()

  const [rsvps, allPhotos, pending] = await Promise.all([listRsvpsForEvent(id), listEventPhotos(id), listPendingEventPhotos(id)])
  // listEventPhotos returns every row; pending submissions get their own queue below.
  const photos = allPhotos.filter((p) => p.status === 'approved')

  const isPastOneTime =
    event.type === 'one_time' && !!event.eventDate && getOneTimeEventDateTime({ eventDate: event.eventDate, eventTime: event.eventTime }) < nowAsEventClock()

  return (
    <main>
      <AdminPageHeader eyebrow="Events" title={event.title} />

      <AdminCard title="RSVPs" aside={<span className="text-sm text-brand-grey">{rsvps.length} total</span>} flush className="mb-8">
        {rsvps.length === 0 ? (
          <EmptyState>No RSVPs yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6">Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="pr-5 text-right sm:pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rsvps.map((r) => (
                <TableRow key={r.id} className="border-brand-black/5">
                  <TableCell className="pl-5 sm:pl-6">{formatUtcDate(r.occurrenceDate)}</TableCell>
                  <TableCell className="font-medium text-brand-black">{r.name}</TableCell>
                  <TableCell className="text-brand-grey">{r.email || '—'}</TableCell>
                  <TableCell className="text-brand-grey">{r.note || '—'}</TableCell>
                  <TableCell className="pr-5 text-right sm:pr-6">
                    <ConfirmDelete name={r.name} action={deleteRsvp.bind(null, r.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminCard>

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
