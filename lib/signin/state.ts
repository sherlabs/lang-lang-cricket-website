import type { Payload } from 'payload'
import type { ConnectionResult } from './broker'

/**
 * The code-written part of the Facebook sign-in settings: the last Test connection result and the last broker event that
 * unlinked someone. Read and written with `overrideAccess` (the fields refuse REST writes). The whole `signIn` group is written
 * back so a partial update can never blank the admin's chosen mode.
 */
export type SignInState = {
  mode: 'off' | 'broker' | 'own-app'
  lastTest: { at: string | null; ok: boolean; summary: string | null }
  lastEvent: { at: string | null; unlinked: number }
}

export async function readSignInState(payload: Payload): Promise<SignInState> {
  let raw: { signIn?: { mode?: string; lastTest?: { at?: string | null; ok?: boolean | null; summary?: string | null }; lastEvent?: { at?: string | null; unlinked?: number | null } } } = {}
  try {
    raw = (await payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })) as typeof raw
  } catch {
    raw = {}
  }
  const s = raw.signIn ?? {}
  return {
    mode: s.mode === 'off' || s.mode === 'own-app' ? s.mode : 'broker',
    lastTest: { at: s.lastTest?.at ?? null, ok: Boolean(s.lastTest?.ok), summary: s.lastTest?.summary ?? null },
    lastEvent: { at: s.lastEvent?.at ?? null, unlinked: s.lastEvent?.unlinked ?? 0 },
  }
}

async function write(payload: Payload, next: SignInState): Promise<void> {
  await payload.updateGlobal({ slug: 'site-settings', data: { signIn: next } as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } })
}

export async function recordTest(payload: Payload, result: ConnectionResult, now: Date = new Date()): Promise<void> {
  const state = await readSignInState(payload)
  await write(payload, { ...state, lastTest: { at: now.toISOString(), ok: result.ok, summary: result.summary.slice(0, 200) } })
}

const EVENT_WINDOW_MS = 7 * 86_400_000

/** Adds `n` unlinked selectors to the running tally (reset when the last event was over a week ago). */
export async function recordUnlinks(payload: Payload, n: number, now: Date = new Date()): Promise<void> {
  if (n < 1) return
  const state = await readSignInState(payload)
  const recent = state.lastEvent.at && now.getTime() - new Date(state.lastEvent.at).getTime() < EVENT_WINDOW_MS
  await write(payload, { ...state, lastEvent: { at: now.toISOString(), unlinked: (recent ? state.lastEvent.unlinked : 0) + n } })
}
