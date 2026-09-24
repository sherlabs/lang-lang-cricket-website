import Link from 'next/link'
import { listEvents, deleteEvent } from './actions'
import { EventForm } from './event-form'
import { formatLocalTime } from '@/lib/playhq/format'
import { DAYS, formatUtcDate } from '@/lib/events-format'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, Badge, EmptyState } from '@/components/admin/admin-card'
import { ConfirmDelete, EditDialog } from '@/components/admin/row-actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

function summarise(e: Awaited<ReturnType<typeof listEvents>>[number]): string {
  const time = e.eventTime ? formatLocalTime(e.eventTime.length === 5 ? `${e.eventTime}:00` : e.eventTime) : null
  if (e.type === 'one_time') {
    const date = e.eventDate ? formatUtcDate(e.eventDate) : '—'
    return time ? `${date} · ${time}` : date
  }
  const day = e.dayOfWeek != null ? DAYS[e.dayOfWeek] : '—'
  const end = e.endDate ? formatUtcDate(e.endDate) : '—'
  return time ? `Every ${day} · ${time} · until ${end}` : `Every ${day} · until ${end}`
}

export default async function EventsAdminPage() {
  const eventList = await listEvents()
  return (
    <main>
      <AdminPageHeader eyebrow="Events" title="Club events" intro="One-time and recurring events, RSVPs and recap photos." />

      <AdminCard title="Add an event" className="mb-8">
        <EventForm />
      </AdminCard>

      <AdminCard title="All events" aside={<span className="text-sm text-brand-grey">{eventList.length} total</span>} flush>
        {eventList.length === 0 ? (
          <EmptyState>No events yet — add one above.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6">Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>When</TableHead>
                <TableHead>RSVPs</TableHead>
                <TableHead className="pr-5 text-right sm:pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventList.map((e) => (
                <TableRow key={e.id} className="border-brand-black/5">
                  <TableCell className="pl-5 font-medium text-brand-black sm:pl-6">
                    <Link href={`/admin/events/${e.id}`} className="hover:underline">
                      {e.title}
                    </Link>
                  </TableCell>
                  <TableCell>{e.type === 'recurring' ? <Badge>Recurring</Badge> : <span className="text-brand-grey">One-time</span>}</TableCell>
                  <TableCell className="text-brand-grey">{summarise(e)}</TableCell>
                  <TableCell className="text-brand-grey">{e.rsvpCount}</TableCell>
                  <TableCell className="pr-5 text-right sm:pr-6">
                    <div className="inline-flex items-center gap-2">
                      {e.pendingPhotoCount > 0 && <Badge>{`${e.pendingPhotoCount} pending photo${e.pendingPhotoCount === 1 ? '' : 's'}`}</Badge>}
                      <EditDialog title="Edit event">
                        <EventForm event={e} />
                      </EditDialog>
                      <ConfirmDelete name={e.title} action={deleteEvent.bind(null, e.id)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminCard>
    </main>
  )
}
