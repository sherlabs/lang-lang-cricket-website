'use server'

import { redirect } from 'next/navigation'
import { selectorPaths } from '@/config/site'
import { isStatus } from '@/lib/availability'
import { requireSelection } from '@/lib/selector-auth'
import { refreshFixturesNow, rotateLink, setAnswerFor, setLinkEnabled } from '@/lib/selector-availability-queries'
import { clearManualPin, issueOneTimeCode, saveSelectorFields, savePhone, setManualPin } from '@/lib/selector-profile-queries'
import { addMembers, applySeed, moveMember, previewSeed, removeMember, searchCandidates, type Candidate, type SeedPreview } from '@/lib/selector-squad-queries'
import type { FormState } from '@/lib/selector-form-state'
import type { Recency } from '@/lib/selection/squad-seed'

/**
 * Server actions for availability, squads and player details. Every one is a public POST, so each calls `requireSelection()` first
 * and then hands the verified user to `lib/selector-*-queries.ts`, which re-checks the role, validates and derives who did it
 * (`setBy`, `addedBy`) from that user. Nothing here reads or writes data itself (a guard test bans `overrideAccess: true` and direct
 * `payload.db` use under `app/(frontend)/selector`).
 */
type Done = { ok: true } | { ok: false; error: string }
const WRONG = { ok: false as const, error: 'Something went wrong. Please try again.' }
const asInt = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : null)

export async function setAnswerAction(input: { playerId: number; fixtureId: number; status: string }): Promise<Done> {
  const user = await requireSelection(selectorPaths.availability)
  const playerId = asInt(input?.playerId)
  const fixtureId = asInt(input?.fixtureId)
  if (playerId == null || fixtureId == null || !(isStatus(input.status) || input.status === 'none')) return WRONG
  return setAnswerFor(user, playerId, fixtureId, input.status)
}

export async function refreshFixturesAction(_prev: FormState): Promise<FormState> {
  const user = await requireSelection(selectorPaths.availability)
  const out = await refreshFixturesNow(user)
  if (!out.ok) return { error: out.error }
  const r = out.result
  return { ok: `Fixtures refreshed: ${r.created} new, ${r.updated} changed, ${r.removed} no longer listed.` }
}

export async function rotateLinkAction(): Promise<void> {
  const user = await requireSelection(selectorPaths.link)
  await rotateLink(user)
  redirect(`${selectorPaths.link}?rotated=1`)
}

export async function setLinkEnabledAction(formData: FormData): Promise<void> {
  const user = await requireSelection(selectorPaths.link)
  await setLinkEnabled(user, formData.get('enabled') === 'on' || formData.get('enabled') === 'true')
  redirect(selectorPaths.link)
}

/** The player card forms. `playerId` is a hidden field: it only picks WHICH player; who is allowed is decided by the signed-in user. */
export async function savePhoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSelection(selectorPaths.availability)
  const playerId = asInt(formData.get('playerId'))
  if (playerId == null) return { error: WRONG.error }
  const res = await savePhone(user, playerId, String(formData.get('phone') ?? ''))
  return res.ok ? { ok: 'Phone saved.' } : { error: res.error }
}

export async function setPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSelection(selectorPaths.availability)
  const playerId = asInt(formData.get('playerId'))
  if (playerId == null) return { error: 'Something went wrong. Please try again.' }
  if (formData.get('clear') === '1') {
    await clearManualPin(user, playerId)
    return { ok: 'Back to the default PIN (the last four digits of the phone).' }
  }
  const res = await setManualPin(user, playerId, String(formData.get('pin') ?? ''))
  return res.ok ? { ok: 'PIN saved. Tell the player; it is not shown again.' } : { error: res.error }
}

export async function issueCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSelection(selectorPaths.availability)
  const playerId = asInt(formData.get('playerId'))
  if (playerId == null) return { error: 'Something went wrong. Please try again.' }
  const code = await issueOneTimeCode(user, playerId)
  // Shown once, here only. It works once, for 24 hours, instead of the PIN.
  return { ok: 'Give this code to the player to type in place of the PIN. It works once, for 24 hours, and is not shown again.', secret: code }
}

export async function saveFieldsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSelection(selectorPaths.availability)
  const playerId = asInt(formData.get('playerId'))
  if (playerId == null) return { error: 'Something went wrong. Please try again.' }
  const res = await saveSelectorFields(user, playerId, { role: formData.get('role'), canKeep: formData.get('canKeep'), notes: formData.get('notes') })
  return res.ok ? { ok: 'Saved.' } : { error: res.error }
}

type Moved = { ok: true; changed: number } | { ok: false; error: string }

export async function addMembersAction(input: { squadId: number; playerIds: number[] }): Promise<Moved> {
  const user = await requireSelection(selectorPaths.squads)
  const squadId = asInt(input?.squadId)
  if (squadId == null || !Array.isArray(input.playerIds)) return WRONG
  return addMembers(user, squadId, input.playerIds.map(Number))
}

export async function moveMemberAction(input: { fromSquadId: number; toSquadId: number; playerId: number }): Promise<Moved> {
  const user = await requireSelection(selectorPaths.squads)
  const [from, to, player] = [asInt(input?.fromSquadId), asInt(input?.toSquadId), asInt(input?.playerId)]
  if (from == null || to == null || player == null) return WRONG
  return moveMember(user, from, to, player)
}

export async function removeMemberAction(input: { squadId: number; playerId: number }): Promise<Moved> {
  const user = await requireSelection(selectorPaths.squads)
  const [squad, player] = [asInt(input?.squadId), asInt(input?.playerId)]
  if (squad == null || player == null) return WRONG
  return removeMember(user, squad, player)
}

const RECENCY = new Set(['all', 'this-season', 'last-season', 'recent', 'never'])
export async function searchCandidatesAction(input: { squadId: number; q: string; recency: string }): Promise<Candidate[]> {
  const user = await requireSelection(selectorPaths.squads)
  const squadId = asInt(input?.squadId)
  if (squadId == null) return []
  return searchCandidates(user, squadId, { q: String(input.q ?? ''), recency: (RECENCY.has(input.recency) ? input.recency : 'all') as Recency | 'all' })
}

export async function previewSeedAction(): Promise<SeedPreview> {
  const user = await requireSelection(selectorPaths.squads)
  return previewSeed(user)
}

export async function applySeedAction(): Promise<{ added: number }> {
  const user = await requireSelection(selectorPaths.squads)
  return applySeed(user)
}
