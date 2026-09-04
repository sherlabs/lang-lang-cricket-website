import { db } from '@/db'
import { galleryPhotos } from '@/db/schema'
import { asc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export default async function GalleryPage() {
  const photos = await db.select().from(galleryPhotos).orderBy(asc(galleryPhotos.sortOrder))
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Gallery</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((p) => (
          <img
            key={p.id}
            src={p.url}
            alt={p.caption || 'Lang Lang Cricket Club'}
            className="aspect-square w-full rounded object-cover"
          />
        ))}
      </div>
    </main>
  )
}
