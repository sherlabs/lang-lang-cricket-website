import { asc } from 'drizzle-orm'
import { db } from '@/db'
import { galleryPhotos } from '@/db/schema'
import { PageHeader } from '@/components/page-header'
import { GalleryGrid } from '@/components/gallery-grid'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Gallery | Lang Lang Cricket Club',
}

export default async function GalleryPage() {
  const photos = await db.select().from(galleryPhotos).orderBy(asc(galleryPhotos.sortOrder))
  return (
    <main>
      <PageHeader
        eyebrow="Gallery"
        title="Around the club"
        intro="Match days, training nights and the people who make Lang Lang what it is. Tap any photo to view it full size."
      />
      <section className="container-site py-12 lg:py-16">
        <p className="mb-6 text-sm text-neutral-500">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </p>
        <GalleryGrid photos={photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }))} />
      </section>
    </main>
  )
}
