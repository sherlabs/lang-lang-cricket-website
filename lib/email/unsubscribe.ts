import 'server-only'
import type { Payload } from 'payload'
import { ipHit } from '@/lib/throttle'
import { addSuppression, removeUnsubscribed } from './suppressions'
import { maskAddress, verifyUnsubToken } from './unsub-token'

/**
 * The public side of the opt-out (wave D spec 9.4). The signed token is the only authority: a valid token is never rate-limited,
 * because mail scanners and providers act from shared addresses. Only a link that fails to check is counted (`unsub-bad`), and a
 * locked bucket changes nothing a person can see (the same "not recognised" page). Reading never writes; only `unsubscribe` and
 * `undo` do, and both are idempotent.
 */
export type UnsubTarget = { recipientId: number; emailHash: string; email: string | null; masked: string | null; campaignId: number | null; unsubscribed: boolean }

const relId = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)

/** Checks the token and loads who it is for, or null. A failed check counts against the caller's address (never a valid one). */
export async function resolveUnsub(payload: Payload, token: string, ip: string | null): Promise<UnsubTarget | null> {
  const id = verifyUnsubToken(token)
  const row = id === null ? null : ((await payload.findByID({ collection: 'email-recipients', id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as { emailHash?: string; email?: string | null; campaign?: unknown } | null)
  if (id === null || !row?.emailHash) {
    await ipHit(payload, 'unsub-bad', ip).catch(() => undefined)
    return null
  }
  const on = await payload.count({ collection: 'email-suppressions', where: { and: [{ emailHash: { equals: row.emailHash } }, { reason: { equals: 'unsubscribed' } }] }, overrideAccess: true })
  return { recipientId: id, emailHash: row.emailHash, email: row.email ?? null, masked: maskAddress(row.email), campaignId: relId(row.campaign), unsubscribed: on.totalDocs > 0 }
}

/** Writes the suppression now. Idempotent: a second call, or an address already blocked for another reason, changes nothing. */
export async function unsubscribe(payload: Payload, t: UnsubTarget): Promise<void> {
  await addSuppression(payload, { emailHash: t.emailHash, email: t.email, reason: 'unsubscribed', source: 'link', campaignId: t.campaignId })
}

/** The "I changed my mind" button: removes an `unsubscribed` entry only (never a bounce, complaint or an admin's entry). Has its own generous limit. */
export async function undo(payload: Payload, t: UnsubTarget, ip: string | null): Promise<'undone' | 'busy'> {
  if (!(await ipHit(payload, 'unsub-undo', ip)).allowed) return 'busy'
  await removeUnsubscribed(payload, t.emailHash)
  return 'undone'
}
