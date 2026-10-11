/**
 * Runs once when the server starts. In production it refuses to serve unless the club's PlayHQ
 * organisation, team prefix and canonical host are configured, so a new club that forgets them can never
 * silently show Lang Lang's data (config/site.ts has no production fallback). Not run at build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return
  const { assertClubEnv } = await import('./config/site')
  assertClubEnv()
  if (process.env.NODE_ENV === 'production') {
    const { ipSourceConfigured } = await import('./lib/client-ip')
    if (!ipSourceConfigured()) console.warn('[security] No trusted client IP source: set TRUSTED_IP_HEADER (a header your reverse proxy overwrites) or host on Vercel. Until then the per-IP sign-in and availability caps are off; account and name locks still apply.')
  }
}
