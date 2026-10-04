/**
 * Runs once when the server starts. In production it refuses to serve unless the club's PlayHQ
 * organisation, team prefix and canonical host are configured, so a new club that forgets them can never
 * silently show Lang Lang's data (config/site.ts has no production fallback). Not run at build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return
  const { assertClubEnv } = await import('./config/site')
  assertClubEnv()
}
