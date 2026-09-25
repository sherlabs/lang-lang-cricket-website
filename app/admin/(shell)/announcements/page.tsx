import { listAnnouncements, deleteAnnouncement } from './actions'
import { AnnouncementForm } from '@/components/admin/announcement-form'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, Badge, EmptyState } from '@/components/admin/admin-card'
import { ConfirmDelete, EditDialog } from '@/components/admin/row-actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function AnnouncementsAdminPage() {
  const items = await listAnnouncements()
  return (
    <main>
      <AdminPageHeader
        eyebrow="Announcements"
        title="Club announcements"
        intro="The latest published announcement shows as a banner on the homepage. All published announcements list on the Announcements page."
      />

      <AdminCard title="Add an announcement" className="mb-8">
        <AnnouncementForm />
      </AdminCard>

      <AdminCard title="All announcements" aside={<span className="text-sm text-brand-grey">{items.length} total</span>} flush>
        {items.length === 0 ? (
          <EmptyState>No announcements yet — add one above.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6">Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="pr-5 text-right sm:pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.id} className="border-brand-black/5">
                  <TableCell className="whitespace-normal pl-5 font-medium text-brand-black sm:pl-6">{a.title}</TableCell>
                  <TableCell>
                    <Badge>{a.published ? 'Published' : 'Draft'}</Badge>
                  </TableCell>
                  <TableCell className="text-brand-grey">{a.createdAt.toLocaleDateString()}</TableCell>
                  <TableCell className="pr-5 text-right sm:pr-6">
                    <div className="inline-flex items-center gap-1">
                      <EditDialog title="Edit announcement">
                        <AnnouncementForm announcement={a} />
                      </EditDialog>
                      <ConfirmDelete name={a.title} action={deleteAnnouncement.bind(null, a.id)} />
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
