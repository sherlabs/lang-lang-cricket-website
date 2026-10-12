'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { volunteerPath } from '@/config/site'
import { clientIp } from '@/lib/client-ip'
import { getPayloadClient } from '@/lib/payload/client'
import { currentClubDate } from '@/lib/selection/club-date'
import { ipHit } from '@/lib/throttle'
import { answerWeek, resolveVolunteer } from '@/lib/volunteer-public'

/**
 * A volunteer's answer for one week. A public POST: it throttles by address, re-verifies the token itself, and writes the answer for
 * the person the token names, whatever the form says. The reply is a redirect back with a short code, never text.
 */
export async function answerAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  const payload = await getPayloadClient()
  const throttle = await ipHit(payload, 'vol', clientIp(await headers()))
  const who = throttle.allowed ? await resolveVolunteer(payload, token) : null
  // A wrong, rotated or throttled link goes to the same page as any other bad link: a plain 404.
  if (!who) redirect(volunteerPath(token))
  const code = await answerWeek(payload, who.id, currentClubDate(), { weekId: formData.get('weekId'), state: formData.get('state'), note: formData.get('note'), preferred: formData.getAll('preferred') })
  redirect(`${volunteerPath(token)}?r=${code}&w=${encodeURIComponent(String(formData.get('weekId') ?? ''))}`)
}
