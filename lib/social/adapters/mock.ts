import type { SizeKey } from '../types'
import type { NetworkAdapter, PublishInput, PublishResult } from './types'

/**
 * The Test network. It never reaches a real service. Used by every test and, for demos, enabled only with `SOCIAL_MOCK_NETWORK=yes`.
 * In production it is refused unless a second flag says the demo is intended (`SOCIAL_MOCK_ALLOW_PROD_DEMO=yes`). This does not
 * depend on VERCEL_ENV, which is absent on self-hosted runs.
 */
export function mockAllowed(env: NodeJS.ProcessEnv): boolean {
  if (env.SOCIAL_MOCK_NETWORK !== 'yes') return false
  return env.NODE_ENV !== 'production' || env.SOCIAL_MOCK_ALLOW_PROD_DEMO === 'yes'
}

/** True when the mock was asked for but is not allowed here: the server refuses to start. */
export const mockRequestedButRefused = (env: NodeJS.ProcessEnv): boolean => env.SOCIAL_MOCK_NETWORK === 'yes' && !mockAllowed(env)

export type MockOutcome = 'success' | 'retryable' | 'rejected' | 'unknown' | 'throw' | 'slow'
const OUTCOMES: readonly MockOutcome[] = ['success', 'retryable', 'rejected', 'unknown', 'throw', 'slow']

/** Test and demo control: the next outcomes to answer, in order, then `fallback`; every call is recorded. */
export const mockControl = {
  queue: [] as MockOutcome[],
  fallback: null as MockOutcome | null,
  calls: [] as PublishInput[],
  /** How long a `slow` answer waits (ms); the abort signal still cuts it short. */
  slowMs: 60_000,
  reset() {
    this.queue = []
    this.fallback = null
    this.calls = []
    this.slowMs = 60_000
  },
}

function outcomeFor(env: NodeJS.ProcessEnv): MockOutcome {
  const next = mockControl.queue.shift()
  if (next) return next
  if (mockControl.fallback) return mockControl.fallback
  const fromEnv = env.SOCIAL_MOCK_OUTCOME as MockOutcome | undefined
  return fromEnv && OUTCOMES.includes(fromEnv) ? fromEnv : 'success'
}

const sizes: readonly SizeKey[] = ['square', 'landscape', 'story']

export const mockAdapter: NetworkAdapter = {
  id: 'mock',
  label: 'Test network',
  live: true,
  sizes,
  limits: { maxChars: 2_200, maxHashtags: 10 },
  isConfigured: (env) => mockAllowed(env),
  async publish(input, signal): Promise<PublishResult> {
    mockControl.calls.push(input)
    const outcome = outcomeFor(process.env)
    switch (outcome) {
      case 'success':
        return { ok: true, remoteId: `mock-${input.postId}-${mockControl.calls.length}`, remoteUrl: `https://example.invalid/mock/${input.postId}` }
      case 'retryable':
        return { ok: false, outcome: 'rejected', retryable: true, reason: 'The Test network is busy. Try again soon.', code: 'rate_limited' }
      case 'rejected':
        return { ok: false, outcome: 'rejected', retryable: false, reason: 'The Test network refused the picture.', code: 'media_rejected' }
      case 'unknown':
        return { ok: false, outcome: 'unknown', reason: 'The Test network did not answer.', code: 'unknown_outcome' }
      case 'throw':
        throw new Error('The Test network crashed.')
      case 'slow':
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, mockControl.slowMs)
          signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) }, { once: true })
        })
        return { ok: true, remoteId: `mock-${input.postId}-slow` }
    }
  },
}
