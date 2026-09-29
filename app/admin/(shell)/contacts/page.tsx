import { listContacts, createContact, removeContact, editContact } from './actions'
import { ContactFields } from './contact-fields'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, EmptyState } from '@/components/admin/admin-card'
import { ActionForm, SubmitButton } from '@/components/admin/action-form'
import { ConfirmDelete, EditDialog } from '@/components/admin/row-actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupPeople } from '@/lib/people'

export const dynamic = 'force-dynamic'

export default async function ContactsAdminPage() {
  const contacts = await listContacts()
  const groups = groupPeople(contacts)
  const roles = Array.from(new Set(contacts.map((c) => c.role)))
  return (
    <main>
      <AdminPageHeader
        eyebrow="Contacts"
        title="Our People"
        intro="Committee members, the senior leadership team and junior coaches. Everyone appears on the Our People page; committee and leadership also appear on the Contact page."
      />

      <AdminCard title="Add a person" className="mb-8">
        <ActionForm action={createContact} resetOnSuccess successText="Person added.">
          <ContactFields roles={roles} />
          <div>
            <SubmitButton>Add person</SubmitButton>
          </div>
        </ActionForm>
      </AdminCard>

      <AdminCard title="All people" aside={<span className="text-sm text-brand-grey">{contacts.length} total</span>} flush>
        {contacts.length === 0 ? (
          <EmptyState>No people yet — add one above.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6" />
                <TableHead>Role</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Order</TableHead>
                <TableHead className="pr-5 text-right sm:pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <GroupRows key={g.key} label={g.label} count={g.people.length}>
                  {g.people.map((c) => (
                    <TableRow key={c.id} className="border-brand-black/5">
                      <TableCell className="pl-5 sm:pl-6">
                        {c.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-stone text-xs font-semibold text-brand-grey-light">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-brand-grey">{c.role}</TableCell>
                      <TableCell className="font-medium text-brand-black">{c.name}</TableCell>
                      <TableCell className="text-brand-grey">{c.phone || '—'}</TableCell>
                      <TableCell className="text-brand-grey">{c.email || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-brand-grey">{c.sortOrder}</TableCell>
                      <TableCell className="pr-5 text-right sm:pr-6">
                        <div className="inline-flex items-center gap-1">
                          <EditDialog title="Edit person">
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
                </GroupRows>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminCard>
    </main>
  )
}

/** A sub-heading row followed by that group's people. */
function GroupRows({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <TableRow className="border-brand-black/5 bg-brand-stone/60 hover:bg-brand-stone/60">
        <TableCell colSpan={7} className="pl-5 py-2.5 sm:pl-6">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-black">{label}</span>
          <span className="ml-2 text-xs tabular-nums text-brand-grey-light">{count}</span>
        </TableCell>
      </TableRow>
      {children}
    </>
  )
}
