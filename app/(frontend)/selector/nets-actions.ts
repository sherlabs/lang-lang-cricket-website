'use server'

import { redirect } from 'next/navigation'
import { selectorPaths } from '@/config/site'
import { addGuest, buildSessionRotation, checkIn, checkOut, createSession, deleteSession, finishSession, nextRound, pauseSession, resumeSession, searchPlayers, startSession, updateSession, type ActionResult, type FoundPlayer, type SnapshotResult } from '@/lib/nets-queries'
import type { FormState } from '@/lib/selector-form-state'
import { requireSelection } from '@/lib/selector-auth'

/**
 * Server actions for net sessions. Each is a public POST, so each calls `requireSelection()` first and hands the verified user to
 * `lib/nets-queries.ts`, which re-checks the role and derives `createdBy` / `checkedInBy` from that user. A form field only says WHICH
 * session and WHAT value; it never says who is acting.
 */
const asInt = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : null)
const WRONG = { ok: false as const, error: 'Something went wrong. Please try again.' }
const sessionFields = (f: FormData) => ({ title: f.get('title'), date: f.get('date'), startTime: f.get('startTime'), nets: f.get('nets'), minutesPerTurn: f.get('minutesPerTurn'), groupSize: f.get('groupSize'), notes: f.get('notes') })

export async function createSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSelection(selectorPaths.nets)
  const res = await createSession(user, sessionFields(formData))
  if (!res.ok) return { error: res.error }
  redirect(selectorPaths.net(res.id))
}

export async function updateSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSelection(selectorPaths.nets)
  const id = asInt(formData.get('sessionId'))
  if (id == null) return { error: WRONG.error }
  const res = await updateSession(user, id, sessionFields(formData))
  return res.ok ? { ok: 'Saved. If you had built a rotation, build it again.' } : { error: res.error }
}

export async function deleteSessionAction(formData: FormData): Promise<void> {
  const user = await requireSelection(selectorPaths.nets)
  const id = asInt(formData.get('sessionId'))
  if (id != null) await deleteSession(user, id)
  redirect(selectorPaths.nets)
}

export async function checkInAction(input: { sessionId: number; playerId: number }): Promise<ActionResult> {
  const user = await requireSelection(selectorPaths.nets)
  const [s, p] = [asInt(input?.sessionId), asInt(input?.playerId)]
  if (s == null || p == null) return WRONG
  return checkIn(user, s, p)
}

export async function checkOutAction(input: { sessionId: number; key: string }): Promise<ActionResult> {
  const user = await requireSelection(selectorPaths.nets)
  const s = asInt(input?.sessionId)
  if (s == null || typeof input.key !== 'string') return WRONG
  return checkOut(user, s, input.key)
}

export async function addGuestAction(input: { sessionId: number; name: string }): Promise<ActionResult> {
  const user = await requireSelection(selectorPaths.nets)
  const s = asInt(input?.sessionId)
  if (s == null) return WRONG
  return addGuest(user, s, input.name)
}

export async function searchPlayersAction(input: { q: string }): Promise<FoundPlayer[]> {
  const user = await requireSelection(selectorPaths.nets)
  return searchPlayers(user, String(input?.q ?? ''))
}

/** The rotation and timer buttons. Each returns the new snapshot (or the reason it did not apply) for the timer to show at once. */
export async function buildRotationAction(input: { sessionId: number }): Promise<SnapshotResult> {
  const user = await requireSelection(selectorPaths.nets)
  const id = asInt(input?.sessionId)
  return id == null ? WRONG : buildSessionRotation(user, id)
}
export async function startSessionAction(input: { sessionId: number }): Promise<SnapshotResult> {
  const user = await requireSelection(selectorPaths.nets)
  const id = asInt(input?.sessionId)
  return id == null ? WRONG : startSession(user, id)
}
export async function pauseSessionAction(input: { sessionId: number }): Promise<SnapshotResult> {
  const user = await requireSelection(selectorPaths.nets)
  const id = asInt(input?.sessionId)
  return id == null ? WRONG : pauseSession(user, id)
}
export async function resumeSessionAction(input: { sessionId: number }): Promise<SnapshotResult> {
  const user = await requireSelection(selectorPaths.nets)
  const id = asInt(input?.sessionId)
  return id == null ? WRONG : resumeSession(user, id)
}
export async function nextRoundAction(input: { sessionId: number }): Promise<SnapshotResult> {
  const user = await requireSelection(selectorPaths.nets)
  const id = asInt(input?.sessionId)
  return id == null ? WRONG : nextRound(user, id)
}
export async function finishSessionAction(input: { sessionId: number }): Promise<SnapshotResult> {
  const user = await requireSelection(selectorPaths.nets)
  const id = asInt(input?.sessionId)
  return id == null ? WRONG : finishSession(user, id)
}
