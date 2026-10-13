'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { TypedUser } from 'payload'
import { getFactsFor, getMatchSeasonYears, NO_YEAR_SEASON } from '@/lib/match-store/stats-queries'
import { getPayloadClient } from '@/lib/payload/client'
import { isStaffUser } from '@/payload/access'
import * as admin from './admin'
import { getSeasonById, getWorkingSeason, type FantasySeason } from './store'
import type { FantasyRules } from './rules'
import type { FactSet } from '../stats/match/types'

/**
 * Server actions behind the Fantasy cricket view. Each is a public POST: the caller is re-derived from the session on every call and
 * checked again inside `lib/fantasy/admin.ts` (staff for the day to day, admin for rules, prices, opening and the link). Season is
 * always the one the server finds; a season id from the browser is only accepted when it names an existing season.
 */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string }
const SIGN_IN = { ok: false, message: 'Please sign in again.' } as const

async function caller() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  return isStaffUser(user) ? { payload, user: user as TypedUser } : null
}

async function seasonFor(payload: Awaited<ReturnType<typeof getPayloadClient>>, id?: number): Promise<FantasySeason | null> {
  return typeof id === 'number' ? getSeasonById(payload, id) : getWorkingSeason(payload)
}

async function factsFor(season: Pick<FantasySeason, 'seasonStartYear' | 'rules'>): Promise<FactSet> {
  const years = (await getMatchSeasonYears()).filter((y) => y !== NO_YEAR_SEASON && y <= season.seasonStartYear).slice(0, season.rules.priceSeasonsBack)
  return getFactsFor(years)
}

const done = <T extends { ok: boolean }>(r: T): T => {
  if (r.ok) revalidatePath('/admin/fantasy')
  return r
}

export async function setUpSeasonAction(input: { year: number; name: string }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const year = Number(input?.year)
  const facts = await factsFor({ seasonStartYear: year, rules: { priceSeasonsBack: 2 } as FantasyRules })
  const r = await admin.setUpSeason(c.payload, c.user, { year, name: String(input?.name ?? ''), facts })
  return done(r.ok ? { ok: true } : r)
}

export async function recalculatePricesAction(): Promise<ActionResult<{ priced: number }>> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'Set up a season first.' }
  return done(await admin.calculatePrices(c.payload, c.user, season, await factsFor(season)))
}

export async function addMissingPlayersAction(): Promise<ActionResult<{ added: number }>> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'Set up a season first.' }
  return done(await admin.addMissingPlayers(c.payload, c.user, season, await factsFor(season)))
}

export async function saveRulesAction(input: { patch: Partial<Omit<FantasyRules, 'scoring'>> & { scoring?: Partial<FantasyRules['scoring']> } }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'Set up a season first.' }
  const r = await admin.updateRules(c.payload, c.user, season, input?.patch ?? {})
  return done(r.ok ? { ok: true } : r)
}

export async function openSeasonAction(): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'Set up a season first.' }
  const r = await admin.openSeason(c.payload, c.user, season)
  return done(r.ok ? { ok: true } : r)
}

export async function closeSeasonAction(): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'There is no season.' }
  return done(await admin.closeSeason(c.payload, c.user, season))
}

export async function setPriceAction(input: { playerId: number; tenths: number | null }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'There is no season.' }
  return done(await admin.setPrice(c.payload, c.user, season, Number(input?.playerId), input?.tenths === null ? null : Number(input?.tenths)))
}

export async function setAvailableAction(input: { playerId: number; available: boolean }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'There is no season.' }
  return done(await admin.setAvailable(c.payload, c.user, season, Number(input?.playerId), Boolean(input?.available)))
}

export async function markRoundScoredAction(input: { round: string; reason: string }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'There is no season.' }
  return done(await admin.markRoundScored(c.payload, c.user, season, String(input?.round ?? ''), String(input?.reason ?? '')))
}

export async function setLockOverrideAction(input: { round: string; at: string }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  const at = new Date(String(input?.at ?? ''))
  if (!season || Number.isNaN(at.getTime())) return { ok: false, message: 'Choose a date and time.' }
  return done(await admin.setLockOverride(c.payload, c.user, season, String(input?.round ?? ''), at))
}

export async function setSwitchAction(input: { enabled?: boolean; publicLeaderboard?: boolean; competitionName?: string }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  return done(await admin.setSwitch(c.payload, c.user, {
    ...(typeof input?.enabled === 'boolean' ? { enabled: input.enabled } : {}),
    ...(typeof input?.publicLeaderboard === 'boolean' ? { publicLeaderboard: input.publicLeaderboard } : {}),
    ...(typeof input?.competitionName === 'string' ? { competitionName: input.competitionName } : {}),
  }))
}

export async function rotateLinkAction(): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const r = await admin.rotateLink(c.payload, c.user)
  return done(r.ok ? { ok: true } : r)
}

export async function setBlockedWordsAction(input: { words: string[] }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'There is no season.' }
  return done(await admin.setBlockedWords(c.payload, c.user, season, Array.isArray(input?.words) ? input.words.map(String) : []))
}

// ---- Managers: the picker returns names and join dates only ----

export async function searchManagersAction(input: { q: string }): Promise<{ id: number; teamName: string; joined: string; disabled: boolean }[]> {
  const c = await caller()
  if (!c) return []
  const season = await seasonFor(c.payload)
  return season ? admin.searchManagers(c.payload, c.user, season, String(input?.q ?? '')) : []
}

export async function resetPinAction(input: { entryId: number }): Promise<ActionResult<{ teamName: string; tempPin: string }>> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'There is no season.' }
  return done(await admin.resetPin(c.payload, c.user, season, Number(input?.entryId)))
}

export async function setDisabledAction(input: { entryId: number; disabled: boolean }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'There is no season.' }
  return done(await admin.setDisabled(c.payload, c.user, season, Number(input?.entryId), Boolean(input?.disabled)))
}

export async function renameEntryAction(input: { entryId: number; name: string }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'There is no season.' }
  return done(await admin.renameEntry(c.payload, c.user, season, Number(input?.entryId), String(input?.name ?? '')))
}

export async function removeEntryAction(input: { entryId: number }): Promise<ActionResult> {
  const c = await caller()
  if (!c) return SIGN_IN
  const season = await seasonFor(c.payload)
  if (!season) return { ok: false, message: 'There is no season.' }
  return done(await admin.removeEntry(c.payload, c.user, season, Number(input?.entryId)))
}
