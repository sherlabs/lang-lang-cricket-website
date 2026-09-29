'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { documents } from '@/db/schema'
import { makeCrudActions } from '@/lib/crud'
import { uploadFile } from '@/lib/blob'
import { requireAdmin } from '@/lib/require-admin'

const actions = makeCrudActions<typeof documents.$inferSelect>(db as never, documents, () =>
  revalidatePath('/documents')
)

export async function listDocuments() {
  await requireAdmin()
  return actions.list()
}

export async function removeDocument(id: number) {
  await requireAdmin()
  await actions.remove(id)
}

export async function updateDocument(id: number, data: Partial<Omit<typeof documents.$inferSelect, 'id' | 'createdAt'>>) {
  await requireAdmin()
  await actions.update(id, data)
}

export async function createDocument(formData: FormData) {
  await requireAdmin()
  const file = formData.get('file') as File
  const url = await uploadFile(file, 'documents')
  await actions.create({
    category: String(formData.get('category')),
    title: String(formData.get('title')),
    url,
  } as never)
}

export async function editDocument(formData: FormData) {
  await requireAdmin()
  const id = Number(formData.get('id'))
  const data: Record<string, unknown> = {
    category: String(formData.get('category')),
    title: String(formData.get('title')),
  }
  const file = formData.get('file') as File | null
  if (file && file.size > 0) {
    data.url = await uploadFile(file, 'documents')
  }
  await updateDocument(id, data as never)
}
