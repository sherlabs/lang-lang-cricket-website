/**
 * Runs `work` after the response has gone out. Inside a Next request that is `after()`; anywhere else (tests, scripts, the payload CLI)
 * `after` throws, and the work simply starts without being awaited. Either way the caller never waits for it, so the time a request
 * takes does not depend on a provider call (and so cannot tell a known address from an unknown one).
 */
export async function runAfterResponse(work: () => Promise<void>): Promise<void> {
  const safe = () => work().catch((err) => console.error('[email] background send failed:', err instanceof Error ? err.message : err))
  try {
    const { after } = await import('next/server')
    after(safe)
  } catch {
    void safe()
  }
}
