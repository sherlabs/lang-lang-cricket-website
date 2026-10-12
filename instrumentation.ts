/**
 * Runs once when the server starts. In production it refuses to serve unless the club's PlayHQ
 * organisation, team prefix and canonical host are configured, so a new club that forgets them can never
 * silently show Lang Lang's data (config/site.ts has no production fallback). Not run at build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return
  const { assertClubEnv } = await import('./config/site')
  assertClubEnv()
  // The Test network must never run in production by accident (wave C spec 4.5): refuse to start rather than quietly allow it.
  const { mockRequestedButRefused } = await import('./lib/social/adapters/mock')
  if (mockRequestedButRefused(process.env)) throw new Error('[social] SOCIAL_MOCK_NETWORK=yes is refused in production. Remove it, or also set SOCIAL_MOCK_ALLOW_PROD_DEMO=yes for a deliberate demo.')
  if (process.env.NODE_ENV === 'production') {
    const { ipSourceConfigured } = await import('./lib/client-ip')
    if (!ipSourceConfigured()) console.warn('[security] No trusted client IP source: set TRUSTED_IP_HEADER (a header your reverse proxy overwrites) or host on Vercel. Until then the per-IP sign-in and availability caps are off; account and name locks still apply.')
  }
}
