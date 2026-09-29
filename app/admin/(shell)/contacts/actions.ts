'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { committeeContacts } from '@/db/schema'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'
import { makeCrudActions } from '@/lib/crud'
import { sectionOf } from '@/lib/people'

type Contact = typeof committeeContacts.$inferSelect
type ContactData = Omit<Contact, 'id' | 'createdAt'>

async function requireAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    throw new Error('Unauthorized')
  }
}

function revalidate() {
  revalidatePath('/')
  revalidatePath('/contact')
  revalidatePath('/people')
  revalidatePath('/admin/contacts')
}

const actions = makeCrudActions<Contact>(db as never, committeeContacts, revalidate)

function fromForm(formData: FormData): ContactData {
  return {
    role: String(formData.get('role') ?? '').trim(),
    name: String(formData.get('name') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    photoUrl: String(formData.get('photoUrl') ?? ''),
    section: sectionOf(formData.get('section')),
    sortOrder: Number(formData.get('sortOrder')) || 0,
  }
}

export async function listContacts(): Promise<Contact[]> {
  await requireAdmin()
  return actions.list()
}

export async function removeContact(id: number): Promise<void> {
  await requireAdmin()
  await actions.remove(id)
}

export async function updateContact(id: number, data: Partial<ContactData>): Promise<void> {
  await requireAdmin()
  await actions.update(id, data)
}

export async function createContact(formData: FormData): Promise<void> {
  await requireAdmin()
  await actions.create(fromForm(formData))
}

export async function editContact(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = Number(formData.get('id'))
  await actions.update(id, fromForm(formData))
}
