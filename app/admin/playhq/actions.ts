'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

export async function refreshPlayHQ() {
  revalidateTag('playhq')
  revalidatePath('/fixtures')
  revalidatePath('/fixtures/[gameId]', 'page')
  revalidatePath('/teams')
  revalidatePath('/teams/[teamId]', 'page')
  return { refreshedAt: new Date().toISOString() }
}
