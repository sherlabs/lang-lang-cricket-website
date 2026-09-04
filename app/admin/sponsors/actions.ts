'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { sponsors } from '@/db/schema'
import { makeCrudActions } from '@/lib/crud'
import { uploadFile } from '@/lib/blob'

const actions = makeCrudActions<typeof sponsors.$inferSelect>(db as never, sponsors, () =>
  revalidatePath('/sponsors')
)

export const listSponsors = actions.list
export const removeSponsor = actions.remove

export async function createSponsor(formData: FormData) {
  const file = formData.get('file') as File
  const logoUrl = await uploadFile(file, 'sponsors')
  await actions.create({
    tier: String(formData.get('tier')),
    name: String(formData.get('name')),
    logoUrl,
    linkUrl: String(formData.get('linkUrl')),
  } as never)
}
