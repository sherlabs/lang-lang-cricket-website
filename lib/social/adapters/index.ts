import { mockAdapter } from './mock'
import { facebookAdapter, instagramAdapter, xAdapter } from './stubs'
import type { Network, NetworkAdapter } from './types'

const ADAPTERS: Record<Network, NetworkAdapter> = { facebook: facebookAdapter, instagram: instagramAdapter, x: xAdapter, mock: mockAdapter }

export const allAdapters = (): NetworkAdapter[] => Object.values(ADAPTERS)

/** The adapter for a network, only when its credentials are present in `env` (otherwise undefined: it is never tried). */
export function getAdapter(network: Network, env: NodeJS.ProcessEnv = process.env): NetworkAdapter | undefined {
  const a = ADAPTERS[network]
  return a && a.isConfigured(env) ? a : undefined
}

/**
 * The networks a post can be scheduled to: `live` and configured. The three real adapters are stubs (`live: false`), so even a club
 * with full credentials gets none of them until the live calls are built. The composer lists exactly this, and the schedule action
 * re-checks it on the server.
 */
export function configuredNetworks(env: NodeJS.ProcessEnv = process.env): NetworkAdapter[] {
  return allAdapters().filter((a) => a.live && a.isConfigured(env))
}

/** Networks the composer shows as "not available yet" with the download fallback beside them. */
export function unavailableNetworks(env: NodeJS.ProcessEnv = process.env): NetworkAdapter[] {
  return allAdapters().filter((a) => a.id !== 'mock' && !(a.live && a.isConfigured(env)))
}
