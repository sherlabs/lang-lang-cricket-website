import type { EmailAdapter as PayloadEmailAdapter } from 'payload'
import { emailEnabled, emailFromAddress, type EmailEnv } from './env'
import { runAfterResponse } from './scheduling'

/**
 * Payload's own mail (the password-reset link) over the same seam as campaigns (wave D spec 9.5). Present only when mail is on;
 * otherwise the config has no email adapter and forgot-password stays refused. `sendEmail` never waits for the provider: it hands the
 * work to `runAfterResponse` and returns, so a request for a known address takes no longer than one for an unknown address.
 * The heavy parts (club, theme, provider) are loaded inside that background job, and this file imports nothing server-only, so the
 * payload CLI can load the config.
 */
export const RESET_MARKER = /^<!--club:reset (\S+)-->$/

export const resetMarker = (link: string): string => `<!--club:reset ${link}-->`

export function emailAdapterForPayload(env: EmailEnv = process.env): PayloadEmailAdapter | undefined {
  if (!emailEnabled(env)) return undefined
  return () => ({
    name: 'club-email',
    defaultFromAddress: emailFromAddress(env) ?? '',
    defaultFromName: env.EMAIL_FROM_NAME?.trim() || '',
    async sendEmail(message) {
      const to = Array.isArray(message.to) ? String(message.to[0] ?? '') : typeof message.to === 'string' ? message.to : ''
      const html = typeof message.html === 'string' ? message.html : ''
      const subject = typeof message.subject === 'string' ? message.subject : ''
      // An empty body means "do not send" (a disabled account asked for a reset): nothing goes out and nothing is revealed.
      if (!to || !html) return
      await runAfterResponse(async () => {
        const { sendResetEmail } = await import('./reset-mail')
        await sendResetEmail({ to, subject, html })
      })
    },
  })
}
