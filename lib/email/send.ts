import 'server-only'
import type { Payload } from 'payload'
import { emailHash } from './unsub-token'
import type { EmailAdapter, EmailMessage, SendFailureKind } from './types'

/**
 * The only two functions that hand a message to an adapter (a source scan in `tests/email-guards.test.ts` pins that):
 *  - `sendCampaignMessage`: everything non-transactional. It re-checks the suppression list immediately before sending, and refuses
 *    a message without the one-click unsubscribe header, so no campaign can go out without an opt-out.
 *  - `sendTransactional`: password reset and similar. Not subject to the suppression list, never carries a marketing footer.
 */
export type CampaignSendOutcome = { status: 'sent'; providerId: string } | { status: 'suppressed' } | { status: 'failed'; kind: SendFailureKind; message: string }

export async function isAddressSuppressed(payload: Payload, address: string): Promise<boolean> {
  const found = await payload.count({ collection: 'email-suppressions', where: { emailHash: { equals: emailHash(address) } }, overrideAccess: true })
  return found.totalDocs > 0
}

/**
 * `campaign` mode is a real send to a recipient. `test` mode is the admin's "send me a copy first": it goes to the admin's own login
 * address, skips the list (an admin who unsubscribed themselves can still preview), and the caller writes no recipient row and no counts.
 */
export async function sendCampaignMessage(payload: Payload, adapter: EmailAdapter, message: EmailMessage, opts: { mode: 'campaign' | 'test' }): Promise<CampaignSendOutcome> {
  if (!message.headers?.['List-Unsubscribe'] || !message.headers['List-Unsubscribe-Post']) throw new Error('[email] a campaign message must carry the unsubscribe headers')
  if (opts.mode === 'campaign' && (await isAddressSuppressed(payload, message.to))) return { status: 'suppressed' }
  const r = await adapter.send(message)
  return r.ok ? { status: 'sent', providerId: r.providerId } : { status: 'failed', kind: r.kind, message: r.message }
}

/** Transactional mail: a direct send. Nothing calls this for campaigns, and it adds no unsubscribe machinery. */
export async function sendTransactional(adapter: EmailAdapter, message: EmailMessage) {
  return adapter.send(message)
}
