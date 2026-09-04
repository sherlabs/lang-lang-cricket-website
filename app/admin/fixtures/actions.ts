'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { fixtures } from '@/db/schema'
import { makeCrudActions } from '@/lib/crud'

const actions = makeCrudActions<typeof fixtures.$inferSelect>(db as never, fixtures, () =>
  revalidatePath('/fixtures')
)

export const listFixtures = actions.list
export const removeFixture = actions.remove

export async function createFixture(formData: FormData) {
  await actions.create({
    team: String(formData.get('team')),
    opponent: String(formData.get('opponent')),
    venue: String(formData.get('venue')),
    matchDate: new Date(String(formData.get('matchDate'))),
    isResult: formData.get('isResult') === 'on',
    resultSummary: String(formData.get('resultSummary')),
  } as never)
}
