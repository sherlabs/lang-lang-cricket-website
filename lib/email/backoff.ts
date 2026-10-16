export const EMAIL_MAX_ATTEMPTS = 3
/** Minutes to wait after the 1st and 2nd failed try. Fixed steps, no jitter, so tests are exact. */
export const EMAIL_BACKOFF_MINUTES = [2, 10] as const

/** When to try again after `attempts` tries have failed (1-based), or null when the recipient is out of tries. */
export function nextEmailAttempt(now: Date, attempts: number, kind: 'rate' | 'transient'): Date | null {
  if (attempts < 1 || attempts >= EMAIL_MAX_ATTEMPTS) return null
  const minutes = EMAIL_BACKOFF_MINUTES[Math.min(attempts, EMAIL_BACKOFF_MINUTES.length) - 1] * (kind === 'rate' ? 2 : 1)
  return new Date(now.getTime() + minutes * 60_000)
}
