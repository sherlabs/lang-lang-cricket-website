import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { getURLFromRedirectError } from 'next/dist/client/components/redirect'
import type { Payload } from 'payload'
import { getSafeRedirect } from 'payload/shared'
import type { ReactNode } from 'react'
import { AuthTroubleNotice } from '../components/AdminNotices'
import { checkSession, sessionToken } from './session-check'

/**
 * Payload's own pages (Home, lists, edit forms) redirect to the login page whenever its session lookup answers "no user", and that
 * answer is also what a *failed* lookup looks like. This runs only when `RootPage` has just thrown such a redirect and a sign-in
 * cookie is present: it takes one bounded second look and, unless the cookie really is no longer a sign-in, returns the calm
 * "could not check" page instead of letting the redirect bounce a signed-in person through the login page. Anything else is
 * rethrown by the caller.
 */
export async function loginBounceNotice(args: {
  error: unknown
  payload: Pick<Payload, 'secret' | 'config' | 'findByID' | 'collections'>
  headers: Headers
  check?: typeof checkSession
}): Promise<ReactNode | null> {
  const { error, payload, headers } = args
  if (!isRedirectError(error)) return null
  const adminRoute = payload.config.routes.admin
  const loginPath = payload.config.admin.routes.login
  const target = getURLFromRedirectError(error)
  if (typeof target !== 'string') return null
  const url = new URL(target, 'http://localhost')
  if (url.pathname !== `${adminRoute}${loginPath}`) return null
  if (sessionToken(headers, payload.config) === null) return null

  const second = await (args.check ?? checkSession)(payload, headers)
  if (second.outcome === 'signed-out') return null // really signed out: the redirect is right
  const back = getSafeRedirect({ redirectTo: url.searchParams.get('redirect') ?? adminRoute, fallbackTo: adminRoute })
  console.warn(JSON.stringify({ evt: 'admin.render', route: url.searchParams.get('redirect')?.split('?')[0] ?? adminRoute, session: second.outcome === 'error' ? 'error' : 'retried-ok-unrecoverable' }))
  return <AuthTroubleNotice reloadHref={back} signInHref={`${adminRoute}${loginPath}?redirect=${encodeURIComponent(back)}`} />
}
