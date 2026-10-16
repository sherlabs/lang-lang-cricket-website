import { SOCIAL_BACKOFF_MINUTES, SOCIAL_MAX_ATTEMPTS } from '@/config/site'

/** When to try again after `attempts` tries have failed (1-based), or null when no attempts remain. Fixed steps, no jitter, so tests are exact. */
export function nextAttemptAt(now: Date, attempts: number, steps: readonly number[] = SOCIAL_BACKOFF_MINUTES, max = SOCIAL_MAX_ATTEMPTS): Date | null {
  if (attempts >= max || attempts < 1) return null
  const minutes = steps[Math.min(attempts, steps.length) - 1]
  return new Date(now.getTime() + minutes * 60_000)
}
