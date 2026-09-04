'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { committeeContacts } from '@/db/schema'
import { makeCrudActions } from '@/lib/crud'

const actions = makeCrudActions<typeof committeeContacts.$inferSelect>(
  db as never,
  committeeContacts,
  () => revalidatePath('/contact')
)

export const listContacts = actions.list
export const removeContact = actions.remove
export const updateContact = actions.update

export async function createContact(formData: FormData) {
  await actions.create({
    role: String(formData.get('role')),
    name: String(formData.get('name')),
    phone: String(formData.get('phone')),
    email: String(formData.get('email')),
    sortOrder: Number(formData.get('sortOrder')),
  } as never)
}

export async function editContact(formData: FormData) {
  const id = Number(formData.get('id'))
  await updateContact(id, {
    role: String(formData.get('role')),
    name: String(formData.get('name')),
    phone: String(formData.get('phone')),
    email: String(formData.get('email')),
    sortOrder: Number(formData.get('sortOrder')),
  } as never)
}
