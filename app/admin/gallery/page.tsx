import { listGalleryPhotos, createGalleryPhoto, removeGalleryPhoto } from './actions'

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
              <td>
                <a href={p.url} target="_blank" className="underline">
                  {p.url}
                </a>
              </td>
              <td>{p.caption}</td>
              <td>{p.sortOrder}</td>
              <td>
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
