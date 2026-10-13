import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { getURLFromRedirectError } from 'next/dist/client/components/redirect'
import type { Payload } from 'payload'
import { getSafeRedirect } from 'payload/shared'
import type { ReactNode } from 'react'
import { selectorPaths } from '@/config/site'
import { renderLogLine, type RenderLog } from '@/lib/admin/timing'
import { AuthTroubleNotice, NoAccessNotice } from '../components/AdminNotices'
import { isSelectorUser, isStaffUser } from '../access'
import { checkSession, sessionToken } from './session-check'

/**
 * Payload's own pages (Home, lists, edit forms) redirect to the login page whenever its session lookup answers "no user", and that
 * answer is also what a *failed* lookup looks like. This runs only when `RootPage` has just thrown such a redirect and a sign-in
 * cookie is present: it takes one bounded second look and, unless the cookie really is no longer a sign-in, returns the calm
 * "could not check" page instead of letting the redirect bounce a signed-in person through the login page. Anything else is
 * rethrown by the caller.
 *
 * It also covers Payload's own "Unauthorized" redirect: a signed-in selector who opens Home, a list or an edit form is sent to
 * `/admin/unauthorized` (Payload's stock page); they get the same "This part of the admin is for the committee" page as on the
 * custom views, with the selector link. A committee member is never shown that page, and a disabled account cannot sign in at all.
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
  const toLogin = url.pathname === `${adminRoute}${loginPath}`
  const toUnauthorized = url.pathname === `${adminRoute}${payload.config.admin.routes.unauthorized}`
  if (!toLogin && !toUnauthorized) return null
  if (sessionToken(headers, payload.config) === null) return null

  const second = await (args.check ?? checkSession)(payload, headers)
  if (second.outcome === 'signed-out') return null // really signed out: the redirect is right
  const log = (session: RenderLog['session'], route: string) => console.warn(renderLogLine({ route, authMs: 0, themeMs: null, viewMs: 0, session }))

  if (second.outcome === 'valid' && !isStaffUser(second.user)) {
    // Signed in but not on the committee (a selector): the calm no-access page instead of Payload's stock one or a login bounce.
    log('not-staff', adminRoute)
    return <NoAccessNotice signOutHref={`${adminRoute}/logout`} selectorHref={isSelectorUser(second.user) ? selectorPaths.home : null} />
  }
  if (toUnauthorized && second.outcome === 'valid') return null // a committee member on Payload's own page: leave it alone

  const back = getSafeRedirect({ redirectTo: url.searchParams.get('redirect') ?? adminRoute, fallbackTo: adminRoute })
  log(second.outcome === 'error' ? 'error' : 'retried-ok', new URL(back, 'http://localhost').pathname)
  return <AuthTroubleNotice reloadHref={back} signInHref={`${adminRoute}${loginPath}?redirect=${encodeURIComponent(back)}`} />
}
