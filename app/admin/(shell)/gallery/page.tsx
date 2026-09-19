/* eslint-disable @next/next/no-img-element */
import { listGalleryPhotos, removeGalleryPhoto, editGalleryPhoto } from './actions'
import { GalleryUploader } from '@/components/admin/gallery-uploader'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, EmptyState } from '@/components/admin/admin-card'
import { ActionForm, SubmitButton } from '@/components/admin/action-form'
import { ConfirmDelete, EditDialog } from '@/components/admin/row-actions'
import { Field, TextInput } from '@/components/admin/fields'

export const dynamic = 'force-dynamic'

export default async function GalleryAdminPage() {
  const photos = await listGalleryPhotos()
  return (
    <main>
      <AdminPageHeader
        eyebrow="Gallery"
        title="Photo gallery"
        intro="Lower sort order shows first. The first six photos also appear on the homepage."
      />

      <AdminCard title="Upload photos" className="mb-8">
        <GalleryUploader />
      </AdminCard>

      <AdminCard title="All photos" aside={<span className="text-sm text-brand-grey">{photos.length} total</span>} flush>
        {photos.length === 0 ? (
          <EmptyState>No photos yet — upload some above.</EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-px bg-brand-black/5 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <li key={p.id} className="flex flex-col bg-white">
                <a href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden bg-brand-stone">
                  <img src={p.url} alt={p.caption || ''} loading="lazy" className="h-full w-full object-cover" />
                </a>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm text-brand-black">
                      {p.caption || <span className="italic text-brand-grey-light">No caption</span>}
                    </p>
                    <span className="shrink-0 rounded-full bg-brand-stone px-2 py-0.5 text-xs tabular-nums text-brand-grey">
                      #{p.sortOrder}
                    </span>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-1">
                    <EditDialog title="Edit photo">
                      <img src={p.url} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
                      <ActionForm action={editGalleryPhoto}>
                        <input type="hidden" name="id" value={p.id} />
                        <Field label="Caption" htmlFor={`photo-${p.id}-caption`}>
                          <TextInput id={`photo-${p.id}-caption`} name="caption" defaultValue={p.caption} />
                        </Field>
                        <Field label="Sort order" htmlFor={`photo-${p.id}-sort`} hint="Lower numbers show first.">
                          <TextInput id={`photo-${p.id}-sort`} name="sortOrder" type="number" defaultValue={p.sortOrder} className="sm:w-32" />
                        </Field>
                        <div>
                          <SubmitButton>Save changes</SubmitButton>
                        </div>
                      </ActionForm>
                    </EditDialog>
                    <ConfirmDelete name={p.caption || `photo #${p.id}`} action={removeGalleryPhoto.bind(null, p.id)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </main>
  )
}
