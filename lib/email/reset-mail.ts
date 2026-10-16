import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { loadMailContext } from './campaign'
import { cleanHeader } from './env'
import { RESET_MARKER } from './payload-adapter'
import { renderTransactional } from './render'
import { getEmailAdapter } from './select'
import { sendTransactional } from './send'

/** The background half of a password-reset email: themed with the club's look, sent as transactional mail (no footer, no unsubscribe). */
export async function sendResetEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  const adapter = getEmailAdapter()
  if (!adapter) return
  const payload = await getPayloadClient()
  const ctx = await loadMailContext(payload)
  if (!ctx) return
  const link = RESET_MARKER.exec(input.html)?.[1]
  const body = link
    ? renderTransactional({ clubName: ctx.clubName, brand: ctx.brand, paragraphs: ['You asked to choose a new password.', 'If you did not ask for this, you can ignore this email and nothing will change.'], action: { label: 'Choose a new password', url: link } })
    : { html: input.html, text: input.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
  await sendTransactional(adapter, {
    to: input.to,
    from: { name: ctx.identity.name, address: ctx.identity.address },
    ...(ctx.identity.replyTo ? { replyTo: ctx.identity.replyTo } : {}),
    subject: cleanHeader(input.subject) || 'Choose a new password',
    html: body.html,
    text: body.text,
  })
}
