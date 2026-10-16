/**
 * What `getTheme()` does when the theme global cannot be read. On Vercel production it must throw: during
 * ISR regeneration Next then keeps serving the last good page, and at build the deploy fails, instead of
 * caching a page painted in the seed colours (wrong brand for any club other than Lang Lang) until the next
 * revalidation. Everywhere else (local dev, tests, preview, a build with no database) it falls back to the seed.
 * Pure, so it is unit-tested without Next or Payload.
 */
export function themeReadFailureIsFatal(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === 'production'
}
