import { listContacts, createContact, removeContact, editContact } from './actions'
import { ContactFields, LEADERSHIP_ROLE } from './contact-fields'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, Badge, EmptyState } from '@/components/admin/admin-card'
import { ActionForm, SubmitButton } from '@/components/admin/action-form'
import { ConfirmDelete, EditDialog } from '@/components/admin/row-actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function ContactsAdminPage() {
  const contacts = (await listContacts()).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  const roles = contacts.map((c) => c.role)
  return (
    <main>
      <AdminPageHeader
        eyebrow="Contacts"
        title="Committee contacts"
        intro="People listed on the Contact page. Roles are free text; one special role puts someone in the leadership section."
      />

      <AdminCard title="Add a contact" className="mb-8">
        <ActionForm action={createContact} resetOnSuccess successText="Contact added.">
          <ContactFields roles={roles} />
          <div>
            <SubmitButton>Add contact</SubmitButton>
          </div>
        </ActionForm>
      </AdminCard>

      <AdminCard title="All contacts" aside={<span className="text-sm text-brand-grey">{contacts.length} total</span>} flush>
        {contacts.length === 0 ? (
          <EmptyState>No contacts yet — add one above.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6">Role</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Order</TableHead>
                <TableHead className="pr-5 text-right sm:pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id} className="border-brand-black/5">
                  <TableCell className="pl-5 sm:pl-6">
                    {c.role === LEADERSHIP_ROLE ? <Badge>{c.role}</Badge> : <span className="text-brand-grey">{c.role}</span>}
                  </TableCell>
                  <TableCell className="font-medium text-brand-black">{c.name}</TableCell>
                  <TableCell className="text-brand-grey">{c.phone || '—'}</TableCell>
                  <TableCell className="text-brand-grey">{c.email || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums text-brand-grey">{c.sortOrder}</TableCell>
                  <TableCell className="pr-5 text-right sm:pr-6">
                    <div className="inline-flex items-center gap-1">
                      <EditDialog title="Edit contact">
                        <ActionForm action={editContact}>
                          <ContactFields contact={c} roles={roles} />
                          <div>
                            <SubmitButton>Save changes</SubmitButton>
                          </div>
                        </ActionForm>
                      </EditDialog>
                      <ConfirmDelete name={c.name} action={removeContact.bind(null, c.id)} />
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
