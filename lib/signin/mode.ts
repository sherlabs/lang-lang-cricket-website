import type { Payload } from 'payload'
import { facebookConfig, hostSupportsFacebook } from '@/lib/facebook-login'
import { parseBrokerConfig, type Env } from './broker'

/**
 * Which Facebook sign-in is really on (wave F spec 3.1). The admin chooses `off`, `broker` or `own-app` on Site settings; what
 * happens is decided here from that choice, the server's env and the host asked. Every route and page asks this function, and
 * env is read at call time. The stored mode is admin-only; this reads it with `overrideAccess`.
 */
export type StoredMode = 'off' | 'broker' | 'own-app'
export type SignInMode = { kind: 'off' | 'broker' | 'own-app'; stored: StoredMode; reason?: string }

export const DEFAULT_SIGNIN_MODE: StoredMode = 'broker'

export const isStoredMode = (v: unknown): v is StoredMode => v === 'off' || v === 'broker' || v === 'own-app'

/** Pure: the truth table. `host` undefined means "no request" (the admin page), so the host rule is not applied. */
export function computeSignIn(o: { stored: StoredMode; env?: Env; serverURL: string; host?: string | null }): SignInMode {
  const env = o.env ?? process.env
  const { stored } = o
  const own = Boolean(facebookConfig(env))
  const broker = parseBrokerConfig(env)
  let result: SignInMode
  if (stored === 'off') result = { kind: 'off', stored, reason: 'Facebook sign-in is switched off.' }
  else if (stored === 'own-app') {
    result = own ? { kind: 'own-app', stored } : { kind: 'off', stored, reason: "the club's own Facebook app id and secret are not set on the server" }
  } else if (broker.cfg) result = { kind: 'broker', stored }
  else if (own) result = { kind: 'own-app', stored, reason: "using the club's own Facebook app because the shared broker is not set up" }
  else result = { kind: 'off', stored, reason: broker.reason ?? 'the broker address and club id are not set on the server' }
  if (result.kind !== 'off' && o.host !== undefined && !hostSupportsFacebook(o.serverURL, o.host)) {
    return { kind: 'off', stored, reason: 'this address is not the website address registered for Facebook sign-in' }
  }
  return result
}

export async function storedSignInMode(payload: Payload): Promise<StoredMode> {
  try {
    const settings = (await payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })) as unknown as { signIn?: { mode?: unknown } | null }
    const mode = settings?.signIn?.mode
    return isStoredMode(mode) ? mode : DEFAULT_SIGNIN_MODE
  } catch {
    return DEFAULT_SIGNIN_MODE
  }
}

export async function resolveSignIn(payload: Payload, o: { env?: Env; host?: string | null } = {}): Promise<SignInMode> {
  return computeSignIn({ stored: await storedSignInMode(payload), env: o.env, serverURL: payload.config.serverURL, host: o.host })
}

/** The request's host as asked (only used to compare with the configured site address). */
export const requestHost = (request: Request): string => request.headers.get('host') ?? new URL(request.url).host
