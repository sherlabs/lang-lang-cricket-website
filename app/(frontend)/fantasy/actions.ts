'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { fantasyPaths } from '@/config/site'
import { clientIp } from '@/lib/client-ip'
import { fantasyCookieName, fantasyCookieOptions, signFantasyCookie } from '@/lib/fantasy/link'
import { changePin, identifyEntry, issueDeviceCode, registerEntry, rememberedEntry, type AuthResult } from '@/lib/fantasy/join'
import { saveSquad, type SaveResult } from '@/lib/fantasy/squads'
import { getPlayableCompetition, resolveFantasyLink } from '@/lib/fantasy/store'
import { NO_MATCH_MESSAGE } from '@/lib/fantasy/throttle'
import { getPayloadClient } from '@/lib/payload/client'
import type { FormState } from '@/lib/selector-form-state'

/**
 * The fantasy game's actions. Each is a public POST, so each re-checks the link or the remembered-device cookie itself. A squad
 * is always saved for the manager named in the signed cookie, for the round the server works out, never for anything the form says.
 */
async function issue(result: Extract<AuthResult, { ok: true }>, linkVersion: number): Promise<void> {
  const value = signFantasyCookie({ entryId: result.entry.id, linkVersion, iat: result.issuedAt })
  ;(await cookies()).set(fantasyCookieName(), value, fantasyCookieOptions())
}

/** Join (a new team) or return (team name plus PIN, or a one-time code from another device). */
export async function joinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '')
  const mode = String(formData.get('mode') ?? 'join')
  const payload = await getPayloadClient()
  const live = await resolveFantasyLink(payload, token)
  if (!live) return { error: NO_MATCH_MESSAGE }
  const ctx = { linkVersion: live.settings.linkVersion, ip: clientIp(await headers()) }
  const result =
    mode === 'return'
      ? await identifyEntry(payload, ctx, live.season, { teamName: formData.get('teamName'), secret: formData.get('pin'), kind: formData.get('kind') === 'code' ? 'code' : 'pin' })
      : await registerEntry(payload, ctx, live.season, { teamName: formData.get('teamName'), pin: formData.get('pin'), again: formData.get('again') })
  if (!result.ok) return { error: result.message }
  await issue(result, live.settings.linkVersion)
  redirect(fantasyPaths.team)
}

async function signedIn() {
  const payload = await getPayloadClient()
  const live = await getPlayableCompetition(payload)
  if (!live) return null
  const raw = (await cookies()).get(fantasyCookieName())?.value
  const me = raw ? await rememberedEntry(payload, raw, live.season, live.settings.linkVersion) : null
  return me ? { payload, ...live, entry: me.entry } : null
}

export async function saveSquadAction(input: { round: string; picks: number[]; captain: number | null }): Promise<SaveResult> {
  const c = await signedIn()
  if (!c) return { ok: false, message: 'Please use your club link to sign in again.' }
  return saveSquad(c.payload, c.season, c.entry.id, { round: input?.round, picks: input?.picks, captain: input?.captain })
}

export async function changePinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const c = await signedIn()
  if (!c) return { error: 'Please use your club link to sign in again.' }
  const ctx = { linkVersion: c.settings.linkVersion, ip: clientIp(await headers()) }
  const r = await changePin(c.payload, ctx, c.season, c.entry.id, { current: formData.get('current'), pin: formData.get('pin'), again: formData.get('again') })
  if (!r.ok) return { error: r.message }
  await issue(r, c.settings.linkVersion)
  return { ok: 'Your PIN has been changed. Other devices need the new PIN.' }
}

/** A one-time code for signing in on another phone. Shown once; only a hash is stored. */
export async function deviceCodeAction(): Promise<FormState> {
  const c = await signedIn()
  if (!c) return { error: 'Please use your club link to sign in again.' }
  const r = await issueDeviceCode(c.payload, c.season, c.entry.id)
  if (!r.ok) return { error: r.message }
  return { ok: 'Type this code with your team name on the other phone within 10 minutes. It works once.', secret: r.code }
}

export async function forgetAction(): Promise<void> {
  ;(await cookies()).set(fantasyCookieName(), '', { ...fantasyCookieOptions(), maxAge: 0 })
  redirect(fantasyPaths.home)
}
