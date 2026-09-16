'use server'

import { cookies } from 'next/headers'
import { revalidatePath, revalidateTag } from 'next/cache'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

export type RefreshState = { refreshedAt: string | null }

// Signature matches useFormState: (prevState, formData) → state.
export async function refreshPlayHQ(): Promise<RefreshState> {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) throw new Error('Unauthorized')

  revalidateTag('playhq')
  revalidatePath('/fixtures')
  revalidatePath('/fixtures/[gameId]', 'page')
  revalidatePath('/teams')
  revalidatePath('/teams/[teamId]', 'page')
  return { refreshedAt: new Date().toISOString() }
}
