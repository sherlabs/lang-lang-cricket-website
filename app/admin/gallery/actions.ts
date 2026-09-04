'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { galleryPhotos } from '@/db/schema'
import { makeCrudActions } from '@/lib/crud'
import { uploadFile } from '@/lib/blob'

const actions = makeCrudActions<typeof galleryPhotos.$inferSelect>(db as never, galleryPhotos, () =>
  revalidatePath('/gallery')
)

export const listGalleryPhotos = actions.list
export const removeGalleryPhoto = actions.remove
export const updateGalleryPhoto = actions.update

export async function createGalleryPhoto(formData: FormData) {
  const file = formData.get('file') as File
  const url = await uploadFile(file, 'gallery')
  await actions.create({
    url,
    caption: String(formData.get('caption')),
    sortOrder: Number(formData.get('sortOrder')),
  } as never)
}

export async function editGalleryPhoto(formData: FormData) {
  const id = Number(formData.get('id'))
  const data: Record<string, unknown> = {
    caption: String(formData.get('caption')),
    sortOrder: Number(formData.get('sortOrder')),
  }
  const file = formData.get('file') as File | null
  if (file && file.size > 0) {
    data.url = await uploadFile(file, 'gallery')
  }
  await updateGalleryPhoto(id, data as never)
}
