'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { availabilityPath } from '@/config/site'
import { availCookieName, availCookieOptions, signAvailCookie } from '@/lib/availability-link'
import { NO_MATCH_MESSAGE } from '@/lib/availability-throttle'
import { identify, rememberedPlayer, resolveLink, respond, type RespondResult } from '@/lib/availability-public'
import { clientIp } from '@/lib/client-ip'
import { getPayloadClient } from '@/lib/payload/client'
import type { FormState } from '@/lib/selector-form-state'

/**
 * The availability link's actions. Each is a public POST, so each re-checks the link token itself. A player's answer is always
 * written for the player named in the signed cookie, never for anything the form says.
 */
export async function identifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '')
  const payload = await getPayloadClient()
  const settings = await resolveLink(payload, token)
  if (!settings) return { error: NO_MATCH_MESSAGE }
  const result = await identify(payload, { linkVersion: settings.linkVersion, ip: clientIp(await headers()) }, String(formData.get('name') ?? ''), String(formData.get('pin') ?? ''))
  if (!result.ok) return { error: result.message }
  const value = signAvailCookie({ playerId: result.playerId, linkVersion: settings.linkVersion, iat: Date.now() })
  ;(await cookies()).set(availCookieName(), value, availCookieOptions())
  redirect(availabilityPath(token))
}

export async function forgetAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  ;(await cookies()).set(availCookieName(), '', { ...availCookieOptions(), maxAge: 0 })
  redirect(availabilityPath(token))
}

export async function answerAction(input: { token: string; fixtureId: number; status: string; note: string }): Promise<RespondResult> {
  const payload = await getPayloadClient()
  const settings = await resolveLink(payload, String(input?.token ?? ''))
  if (!settings) return { ok: false, message: 'This link is not working any more. Ask a selector for the new one.' }
  const player = await rememberedPlayer(payload, (await cookies()).get(availCookieName())?.value, settings)
  if (!player) return { ok: false, message: 'Please type your name and PIN again.' }
  return respond(payload, player.id, { fixtureId: input.fixtureId, status: input.status, note: input.note }, settings)
}
