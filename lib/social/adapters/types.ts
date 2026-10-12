import type { SizeKey } from '../types'

/** The networks a post can go to. `mock` is the Test network: it never reaches a real service. */
/** The environment as the social code reads it (a plain record, so tests can pass a few keys). */
export type SocialEnv = Record<string, string | undefined>

export const NETWORKS = ['facebook', 'instagram', 'x', 'mock'] as const
export type Network = (typeof NETWORKS)[number]
export const isNetwork = (v: unknown): v is Network => typeof v === 'string' && (NETWORKS as readonly string[]).includes(v)

export type PublishInput = { postId: number; network: Network; text: string; imageUrl: string }

/**
 * What an adapter answers (wave C spec 4.5). `rejected` means the network provably did not accept the request, so nothing was
 * posted. `unknown` means the request may have reached the network, so nobody can tell; it is never retried automatically.
 */
export type PublishResult =
  | { ok: true; remoteId: string; remoteUrl?: string }
  | { ok: false; outcome: 'rejected'; retryable: boolean; reason: string; code?: string }
  | { ok: false; outcome: 'unknown'; reason: string; code?: string }

export interface NetworkAdapter {
  id: Network
  label: string
  /** False for the stubs: they cannot be scheduled to, so a post is never queued for a network that cannot send it. */
  live: boolean
  /** Sizes the network accepts, default first. */
  sizes: readonly SizeKey[]
  limits: { maxChars: number; maxHashtags: number }
  isConfigured(env: SocialEnv): boolean
  publish(input: PublishInput, signal: AbortSignal): Promise<PublishResult>
}
