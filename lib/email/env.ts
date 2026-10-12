export type EmailEnv = Record<string, string | undefined>

export type EmailProvider = 'resend' | 'mock'

export const DEFAULT_BATCH_SIZE = 50
export const DEFAULT_RATE_PER_SECOND = 2
export const DEFAULT_MAX_RECIPIENTS = 2000

/** The configured provider, or null (off). Anything but `resend` or `mock` is off, never a guess. */
export function emailProvider(env: EmailEnv = process.env): EmailProvider | null {
  const v = env.EMAIL_PROVIDER?.trim().toLowerCase()
  return v === 'resend' || v === 'mock' ? v : null
}

const FROM_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

export const emailFromAddress = (env: EmailEnv = process.env): string | null => {
  const v = env.EMAIL_FROM_ADDRESS?.trim()
  return v && FROM_RE.test(v) ? v : null
}

/**
 * Is outbound mail on? True only with a provider, a from address and (for a real provider) its key. When false the whole Email module
 * is hidden, its routes answer 404, nothing runs on the schedule, password reset stays off and no network call is ever tried.
 * Read at call time, never at import time, so tests and deployments can flip it.
 */
export function emailEnabled(env: EmailEnv = process.env): boolean {
  const provider = emailProvider(env)
  if (!provider || !emailFromAddress(env)) return false
  return provider === 'mock' ? true : Boolean(env.RESEND_API_KEY?.trim())
}

const positiveInt = (v: string | undefined, fallback: number, max: number): number => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback
}

export type EmailLimits = { batchSize: number; ratePerSecond: number; maxRecipients: number }
export function emailLimits(env: EmailEnv = process.env): EmailLimits {
  return {
    batchSize: positiveInt(env.EMAIL_BATCH_SIZE, DEFAULT_BATCH_SIZE, 500),
    ratePerSecond: positiveInt(env.EMAIL_RATE_PER_SECOND, DEFAULT_RATE_PER_SECOND, 100),
    maxRecipients: positiveInt(env.EMAIL_MAX_RECIPIENTS, DEFAULT_MAX_RECIPIENTS, 100_000),
  }
}

export type SenderIdentity = { name: string; address: string; replyTo: string | null }

/** A header value with no line breaks or angle brackets or quotes (header injection, and a display name that stays quotable). */
export const cleanHeader = (v: string): string => v.replace(/[\r\n<>"]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Who mail comes from: the env address, the env name or the club name, and the env reply-to or the club contact address. Never a literal. */
export function senderIdentity(club: { name: string; email: string }, env: EmailEnv = process.env): SenderIdentity | null {
  const address = emailFromAddress(env)
  if (!address) return null
  const replyTo = env.EMAIL_REPLY_TO?.trim() || club.email || null
  return { name: cleanHeader(env.EMAIL_FROM_NAME?.trim() || club.name), address, replyTo: replyTo && FROM_RE.test(replyTo) ? replyTo : null }
}
