import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getAdminEventById } from '../actions'
import { listRsvpsForEvent, deleteRsvp } from '../rsvp-actions'
import { listEventPhotos, removeEventPhoto } from '../photo-actions'
import { getOneTimeEventDateTime } from '@/lib/event-occurrences'
import { RecapUploader } from './recap-uploader'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, EmptyState } from '@/components/admin/admin-card'
import { ConfirmDelete } from '@/components/admin/row-actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

// `occurrenceDate` is a full timestamp with the event's local time-of-day merged
// into UTC fields (see Task 2 / db/schema.ts) — the same convention `eventDate`
// uses. Format it with an explicit UTC timezone so the server's ambient timezone
// can't shift the displayed calendar day, matching the pattern in ../page.tsx.
function formatUtcDate(d: Date): string {
  return d.toLocaleDateString(undefined, { timeZone: 'UTC' })
}

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  noStore()
  const id = Number(params.id)
  const event = await getAdminEventById(id)
  if (!event) notFound()

  const [rsvps, photos] = await Promise.all([listRsvpsForEvent(id), listEventPhotos(id)])

  const isPastOneTime =
    event.type === 'one_time' && !!event.eventDate && getOneTimeEventDateTime({ eventDate: event.eventDate, eventTime: event.eventTime }) < new Date()

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
