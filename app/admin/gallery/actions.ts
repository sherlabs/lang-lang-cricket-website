'use server'

import { revalidatePath } from 'next/cache'
import { del } from '@vercel/blob'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { galleryPhotos } from '@/db/schema'

function revalidate() {
  revalidatePath('/gallery')
  revalidatePath('/')
  revalidatePath('/admin/gallery')
}

export async function listGalleryPhotos() {
  return db.select().from(galleryPhotos).orderBy(asc(galleryPhotos.sortOrder))
}

/** Register already-uploaded blob URLs. New photos go to the front so they show on the homepage. */
export async function addGalleryPhotos(urls: string[], caption = '') {
  const clean = urls.filter((u) => typeof u === 'string' && u.includes('.blob.vercel-storage.com'))
  if (clean.length === 0) return
  await db.update(galleryPhotos).set({ sortOrder: sql`${galleryPhotos.sortOrder} + ${clean.length}` })
  await db.insert(galleryPhotos).values(clean.map((url, i) => ({ url, caption, sortOrder: i })))
  revalidate()
}

export async function editGalleryPhoto(formData: FormData) {
  const id = Number(formData.get('id'))
  await db
    .update(galleryPhotos)
    .set({
      caption: String(formData.get('caption') ?? ''),
      sortOrder: Number(formData.get('sortOrder') ?? 0),
    })
    .where(eq(galleryPhotos.id, id))
  revalidate()
}

export async function removeGalleryPhoto(id: number) {
  const [row] = await db.select().from(galleryPhotos).where(eq(galleryPhotos.id, id))
  if (!row) return
  await db.delete(galleryPhotos).where(eq(galleryPhotos.id, id))
  // Photos uploaded through admin live in Vercel Blob; bundled /assets ones are static files.
  if (row.url.includes('.blob.vercel-storage.com')) {
    await del(row.url).catch(() => {})
  }
  revalidate()
}
