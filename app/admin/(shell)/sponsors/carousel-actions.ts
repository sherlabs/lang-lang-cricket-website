'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'
import { SPONSOR_CAROUSEL_TIERS_KEY, normaliseTiers } from '@/lib/site-settings'

async function requireAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    throw new Error('Unauthorized')
  }
}

/** Save which sponsor tiers scroll on the home page. No ticked boxes stores `[]`, which hides the carousel. */
export async function saveSponsorCarouselTiers(formData: FormData): Promise<void> {
  await requireAdmin()
  const tiers = normaliseTiers(formData.getAll('tiers').map(String)) ?? []
  const now = new Date()
  await db
    .insert(siteSettings)
    .values({ key: SPONSOR_CAROUSEL_TIERS_KEY, value: tiers, updatedAt: now })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: tiers, updatedAt: now } })
  revalidatePath('/')
  revalidatePath('/admin/sponsors')
}
