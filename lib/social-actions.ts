'use server'

import { headers } from 'next/headers'
import { getPayloadClient } from '@/lib/payload/client'
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
