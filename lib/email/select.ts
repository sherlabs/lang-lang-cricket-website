import { emailEnabled, emailProvider, type EmailEnv } from './env'
import { createResendAdapter } from './adapters/resend'
import { mockAdapter } from './adapters/mock'
import type { EmailAdapter } from './types'

/** The adapter for the current environment, or null when mail is off. */
export function getEmailAdapter(env: EmailEnv = process.env): EmailAdapter | null {
  if (!emailEnabled(env)) return null
  return emailProvider(env) === 'resend' ? createResendAdapter(env.RESEND_API_KEY!.trim()) : mockAdapter
}
