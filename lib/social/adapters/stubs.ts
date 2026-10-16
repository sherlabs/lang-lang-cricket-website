import type { SizeKey } from '../types'
import type { Network, NetworkAdapter, PublishResult } from './types'

/**
 * The three real networks are stubs in this wave (spec 4.5): each declares its env contract and limits, is `live: false`, and its
 * `publish` makes no call and imports no network SDK. They answer "not switched on" instead of pretending to post, so a configured
 * production site can never report a post as published that was never posted. Flipping `live` and writing the call is the follow-up
 * (issue #23); until then `configuredNetworks` never offers them.
 */
const NOT_SWITCHED_ON: PublishResult = { ok: false, outcome: 'rejected', retryable: false, reason: 'Live publishing for this network is not switched on in this build', code: 'not_implemented' }

function stub(o: { id: Network; label: string; sizes: readonly SizeKey[]; limits: NetworkAdapter['limits']; env: readonly string[] }): NetworkAdapter {
  return {
    id: o.id,
    label: o.label,
    live: false,
    sizes: o.sizes,
    limits: o.limits,
    isConfigured: (env) => o.env.every((k) => Boolean(env[k]?.trim())),
    publish: async () => NOT_SWITCHED_ON,
  }
}

export const facebookAdapter = stub({ id: 'facebook', label: 'Facebook', sizes: ['landscape', 'square'], limits: { maxChars: 63_206, maxHashtags: 10 }, env: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'] })
export const instagramAdapter = stub({ id: 'instagram', label: 'Instagram', sizes: ['square'], limits: { maxChars: 2_200, maxHashtags: 30 }, env: ['INSTAGRAM_BUSINESS_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'] })
export const xAdapter = stub({ id: 'x', label: 'X', sizes: ['landscape', 'square'], limits: { maxChars: 280, maxHashtags: 3 }, env: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'] })

/** Environment variables that hold credentials; their values are scrubbed from anything stored or logged. */
export const SECRET_ENV_KEYS = [
  'FACEBOOK_PAGE_ACCESS_TOKEN', 'INSTAGRAM_ACCESS_TOKEN', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET', 'CRON_SECRET', 'PAYLOAD_SECRET',
] as const
