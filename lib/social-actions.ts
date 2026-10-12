'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { deletePost, markTargetNotPosted, markTargetPosted, pausePost, retryPost, savePost } from '@/lib/social/queue-core'
import { validateCaptionSettings } from '@/lib/social/settings'
import { isStaffUser } from '@/payload/access'

export type SaveResult = { ok: true } | { ok: false; error: string }

/**
 * Saves the three fields an editor may change (hashtags, sign-off, caption wording). The caller is re-derived from the session on
 * every call (a server action is a public POST), checked as committee, validated, and written with access rules on, so the global's
 * own field access stays the last word: styling fields cannot be reached from here at all.
 */
export async function saveCaptionSettings(input: unknown): Promise<SaveResult> {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  if (!isStaffUser(user)) return { ok: false, error: 'Please sign in again.' }
  const checked = validateCaptionSettings(input)
  if (!checked.ok) return checked
  try {
    await payload.updateGlobal({ slug: 'social-settings', data: checked.value, user, overrideAccess: false, depth: 0 })
    return { ok: true }
  } catch (err) {
    console.warn('[social] settings not saved:', (err as Error).message)
    return { ok: false, error: 'Could not save. Please try again.' }
  }
}

// ---- The posting queue (wave C WP-2). Each action is a public POST: the caller is re-derived from the session and must be staff
// (admin or editor), the input is validated by a pure function, and status, creator and approver come from the server, never the form. ----

async function staffOrNull() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  return isStaffUser(user) ? { payload, user: user as TypedUser } : null
}
const SIGN_IN: SaveResult = { ok: false, error: 'Please sign in again.' }

/** Keep the draft, change nothing else. */
export async function saveDraft(input: unknown): Promise<SaveResult & { id?: number }> {
  const c = await staffOrNull()
  if (!c) return SIGN_IN
  try {
    const r = await savePost(c.payload, c.user, input, 'draft')
    if (r.ok) revalidatePath('/admin/social')
    return r
  } catch (err) {
    console.warn('[social] draft not saved:', (err as Error).message)
    return { ok: false, error: 'Could not save. Please try again.' }
  }
}

/** Scheduling is the approval: it records who and when from the session. */
export async function schedulePost(input: unknown): Promise<SaveResult & { id?: number }> {
  const c = await staffOrNull()
  if (!c) return SIGN_IN
  try {
    const r = await savePost(c.payload, c.user, input, 'schedule')
    if (r.ok) revalidatePath('/admin/social')
    return r
  } catch (err) {
    console.warn('[social] post not scheduled:', (err as Error).message)
    return { ok: false, error: 'Could not schedule. Please try again.' }
  }
}

const idOf = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null)

async function withPost(id: unknown, run: (c: NonNullable<Awaited<ReturnType<typeof staffOrNull>>>, id: number) => Promise<SaveResult>): Promise<SaveResult> {
  const c = await staffOrNull()
  if (!c) return SIGN_IN
  const n = idOf(id)
  if (n === null) return { ok: false, error: 'Something went wrong. Please try again.' }
  try {
    const r = await run(c, n)
    if (r.ok) revalidatePath('/admin/social')
    return r
  } catch (err) {
    console.warn('[social] action failed:', (err as Error).message)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

/** "Pause (back to draft)". */
export async function pauseScheduledPost(id: unknown): Promise<SaveResult> {
  return withPost(id, (c, n) => pausePost(c.payload, n))
}
export async function retryFailedPost(id: unknown): Promise<SaveResult> {
  return withPost(id, (c, n) => retryPost(c.payload, c.user, n))
}
export async function deleteQueuedPost(id: unknown): Promise<SaveResult> {
  return withPost(id, (c, n) => deletePost(c.payload, n))
}
export async function markNetworkPosted(targetId: unknown): Promise<SaveResult> {
  return withPost(targetId, (c, n) => markTargetPosted(c.payload, n))
}
export async function markNetworkNotPosted(targetId: unknown): Promise<SaveResult> {
  return withPost(targetId, (c, n) => markTargetNotPosted(c.payload, n))
}
