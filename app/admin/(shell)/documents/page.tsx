import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { listDocuments, createDocument, removeDocument, editDocument } from './actions'
import { DocumentFields } from './document-fields'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, Badge, EmptyState } from '@/components/admin/admin-card'
import { ActionForm, SubmitButton } from '@/components/admin/action-form'
import { ConfirmDelete, EditDialog } from '@/components/admin/row-actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function DocumentsAdminPage() {
  const docs = await listDocuments()
  return (
    <main>
      <AdminPageHeader
        eyebrow="Documents"
        title="Club documents"
        intro="PDFs shown on the public Documents page, grouped by category."
      />

      <AdminCard title="Add a document" className="mb-8">
        <ActionForm action={createDocument} resetOnSuccess successText="Document added.">
          <DocumentFields />
          <div>
            <SubmitButton pendingText="Uploading…">Add document</SubmitButton>
          </div>
        </ActionForm>
      </AdminCard>

      <AdminCard title="All documents" aside={<span className="text-sm text-brand-grey">{docs.length} total</span>} flush>
        {docs.length === 0 ? (
          <EmptyState>No documents yet — add one above.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6">Category</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="pr-5 text-right sm:pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id} className="border-brand-black/5">
                  <TableCell className="pl-5 sm:pl-6">
                    <Badge>{d.category}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal font-medium text-brand-black">{d.title}</TableCell>
                  <TableCell>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-gold-deep hover:underline"
                    >
                      Open PDF
                      <HugeiconsIcon icon={ArrowUpRight01Icon} className="h-4 w-4" aria-hidden />
                    </a>
                  </TableCell>
                  <TableCell className="pr-5 text-right sm:pr-6">
                    <div className="inline-flex items-center gap-1">
                      <EditDialog title="Edit document">
                        <ActionForm action={editDocument}>
                          <DocumentFields doc={d} />
                          <div>
                            <SubmitButton>Save changes</SubmitButton>
                          </div>
                        </ActionForm>
                      </EditDialog>
                      <ConfirmDelete name={d.title} action={removeDocument.bind(null, d.id)} />
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
