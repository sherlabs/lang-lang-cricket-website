/* eslint-disable @next/next/no-img-element */
import { listGalleryPhotos, removeGalleryPhoto, editGalleryPhoto } from './actions'
import { GalleryUploader } from '@/components/admin/gallery-uploader'

export const dynamic = 'force-dynamic'

export default async function GalleryAdminPage() {
  const photos = await listGalleryPhotos()
  return (
    <main>
      <h1 className="mb-1 text-xl font-semibold">Gallery</h1>
      <p className="mb-4 text-sm text-neutral-600">
        {photos.length} photos. Lower sort order shows first; the first 6 appear on the homepage.
      </p>

      <GalleryUploader />

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded border p-2 text-sm">
            <a href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded bg-neutral-100">
              <img src={p.url} alt={p.caption || ''} loading="lazy" className="h-full w-full object-cover" />
            </a>
            <form action={editGalleryPhoto} className="flex flex-col gap-1">
              <input type="hidden" name="id" value={p.id} />
              <input name="caption" defaultValue={p.caption} placeholder="Caption" className="rounded border px-2 py-1" />
              <div className="flex items-center gap-1">
                <label className="text-xs text-neutral-500" htmlFor={`sort-${p.id}`}>
                  Sort
                </label>
                <input
                  id={`sort-${p.id}`}
                  type="number"
                  name="sortOrder"
                  defaultValue={p.sortOrder}
                  className="w-20 rounded border px-2 py-1"
                />
                <button type="submit" className="ml-auto rounded bg-emerald-700 px-3 py-1 text-white">
                  Save
                </button>
              </div>
            </form>
            <form
              action={async () => {
                'use server'
                await removeGalleryPhoto(p.id)
              }}
            >
              <button type="submit" className="text-xs text-red-600 hover:underline">
                Delete
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  )
}
