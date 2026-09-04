import {
  listGalleryPhotos,
  createGalleryPhoto,
  removeGalleryPhoto,
  editGalleryPhoto,
} from './actions'

export const dynamic = 'force-dynamic'

export default async function GalleryAdminPage() {
  const photos = await listGalleryPhotos()
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Gallery</h1>
      <form action={createGalleryPhoto} className="mb-6 flex flex-wrap gap-2">
        <input type="file" name="file" accept="image/*" required />
        <input name="caption" placeholder="Caption" className="rounded border px-2 py-1" />
        <input
          type="number"
          name="sortOrder"
          placeholder="Sort order"
          defaultValue={0}
          className="w-28 rounded border px-2 py-1"
        />
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
          Add
        </button>
      </form>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Photo</th>
            <th>Caption</th>
            <th>Sort</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {photos.map((p) => (
            <tr key={p.id} className="border-t">
              <td colSpan={4}>
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <form action={editGalleryPhoto} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <a href={p.url} target="_blank" className="underline">
                      current photo
                    </a>
                    <input type="file" name="file" accept="image/*" />
                    <input
                      name="caption"
                      defaultValue={p.caption}
                      placeholder="Caption"
                      className="rounded border px-2 py-1"
                    />
                    <input
                      type="number"
                      name="sortOrder"
                      defaultValue={p.sortOrder}
                      className="w-28 rounded border px-2 py-1"
                    />
                    <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
                      Save
                    </button>
                  </form>
                  <form
                    action={async () => {
                      'use server'
                      await removeGalleryPhoto(p.id)
                    }}
                  >
                    <button type="submit" className="text-red-600">
                      Delete
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
