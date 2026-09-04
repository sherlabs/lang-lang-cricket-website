'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { documents } from '@/db/schema'
import { makeCrudActions } from '@/lib/crud'
import { uploadFile } from '@/lib/blob'

const actions = makeCrudActions<typeof documents.$inferSelect>(db as never, documents, () =>
  revalidatePath('/documents')
)

export const listDocuments = actions.list
export const removeDocument = actions.remove

export async function createDocument(formData: FormData) {
  const file = formData.get('file') as File
  const url = await uploadFile(file, 'documents')
  await actions.create({
    category: String(formData.get('category')),
    title: String(formData.get('title')),
    url,
  } as never)
}
