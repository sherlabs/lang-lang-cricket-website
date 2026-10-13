import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { selectorPaths } from '@/config/site'
import { loginRedirectUrl, adminReturnPath, queryKeysFor } from '@/lib/admin/redirect'
import { renderLogLine, requestTimings, type RenderLog } from '@/lib/admin/timing'
import { classifySession } from '../admin/classify-session'
import { AuthTroubleNotice, NoAccessNotice } from './AdminNotices'

/**
 * Custom admin views are not wrapped in Payload's template automatically: this adds the
 * sidebar, header and page gutter so Help / Waiting for approval look like every other page.
 */
export function AdminPage({ view, children, className = '' }: { view: AdminViewServerProps; children: ReactNode; className?: string }) {
  const { initPageResult, params, searchParams } = view
  logRender(view)
  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={initPageResult.req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <div className={`club-page ${className}`.trim()}>{children}</div>
      </Gutter>
    </DefaultTemplate>
  )
}

type GateRecord = { route: string; authMs: number; session: RenderLog['session']; startedAt: number }
const gates = new WeakMap<object, GateRecord>()

function logRender(view: AdminViewServerProps): void {
  const record = gates.get(view.initPageResult)
  if (record === undefined) return
  gates.delete(view.initPageResult)
  const themeMs = requestTimings().themeMs ?? null
  console.info(renderLogLine({ route: record.route, authMs: record.authMs, themeMs, viewMs: Math.round(performance.now() - record.startedAt), session: record.session }))
}

/**
 * Custom views are reachable by anyone who knows the URL (Payload does not gate them), so every one must call this first, before
 * reading any data, and return what it gives back unless that is null:
 *
 *   const denied = await requireStaff(view, '/social')
 *   if (denied !== null) return denied
 *
 * Staff (admin or editor) continue. Signed-out visitors go to the login page with the full return path (the view's own path plus
 * its allowlisted query, built by `lib/admin/redirect.ts`). A signed-in person who is not on the committee, and a sign-in check that
 * failed, get a calm page instead of a redirect: a redirect would loop in the first case and lie in the second.
 */
export async function requireStaff(view: AdminViewServerProps, viewPath: string): Promise<ReactNode | null> {
  const { req } = view.initPageResult
  const adminRoute = req.payload.config.routes.admin
  const startedAt = performance.now()
  const gate = await classifySession({ user: req.user, headers: req.headers, payload: req.payload })
  const authMs = Math.round(performance.now() - startedAt)
  const route = `${adminRoute}${viewPath}`
  const note = (session: RenderLog['session']) => gates.set(view.initPageResult, { route, authMs, session, startedAt })

  if (gate.kind === 'staff') {
    if (gate.user !== null) req.user = gate.user as unknown as typeof req.user // the first lookup failed and the second one worked
    note(gate.session)
    return null
  }
  const query = view.searchParams
  if (gate.kind === 'signed-out') {
    console.info(renderLogLine({ route, authMs, themeMs: requestTimings().themeMs ?? null, viewMs: 0, session: 'signed-out' }))
    redirect(loginRedirectUrl({ adminRoute, viewPath, query, keys: queryKeysFor(viewPath) }))
  }
  if (gate.kind === 'error') {
    console.warn(renderLogLine({ route, authMs, themeMs: requestTimings().themeMs ?? null, viewMs: 0, session: 'error' }))
    const back = adminReturnPath({ adminRoute, viewPath, query })
    return <AuthTroubleNotice reloadHref={back} signInHref={loginRedirectUrl({ adminRoute, viewPath, query })} />
  }
  console.info(renderLogLine({ route, authMs, themeMs: requestTimings().themeMs ?? null, viewMs: 0, session: 'not-staff' }))
  return <NoAccessNotice signOutHref={`${adminRoute}/logout`} selectorHref={gate.selector ? selectorPaths.home : null} />
}
