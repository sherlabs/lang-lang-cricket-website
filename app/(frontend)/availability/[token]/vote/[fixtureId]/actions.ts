'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { votePaths } from '@/config/site'
import { availCookieName } from '@/lib/availability-link'
import { clientIp } from '@/lib/client-ip'
import { getPayloadClient } from '@/lib/payload/client'
import { castBallotFor } from '@/lib/votes-queries'
import { picksFromForm } from '@/lib/votes/ballot'

/**
 * Casts or changes the player's ballot. A public POST: the player is whoever the signed cookie says (never a form field), the link
 * token and the game are re-checked, and every ineligible case ends at the same plain page. The result is carried back to the page
 * as a short code in the address, so the form needs no JavaScript.
 */
export async function castVoteAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  const fixtureId = String(formData.get('fixtureId') ?? '')
  const payload = await getPayloadClient()
  const res = await castBallotFor(payload, {
    token,
    cookie: (await cookies()).get(availCookieName())?.value,
    fixtureId,
    readPicks: (n) => picksFromForm((k) => formData.get(k), n),
    ip: clientIp(await headers()),
  })
  const base = votePaths.vote(encodeURIComponent(token), encodeURIComponent(fixtureId))
  if (res.ok) redirect(`${base}?saved=1`)
  redirect(`${base}?e=${res.code === 'invalid' ? (res.reason ?? 'bad_input') : res.code}`)
}
