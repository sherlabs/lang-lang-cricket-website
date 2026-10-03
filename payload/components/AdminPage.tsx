import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Custom admin views are not wrapped in Payload's template automatically: this adds the
 * sidebar, header and page gutter so Help / Waiting for approval look like every other page.
 */
export function AdminPage({ view, children, className = '' }: { view: AdminViewServerProps; children: ReactNode; className?: string }) {
  const { initPageResult, params, searchParams } = view
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

/**
 * Custom views are reachable by anyone who knows the URL (Payload does not gate them), so every
 * one must call this first, before reading any data: no signed-in user means back to the login.
 */
export function requireUser(view: AdminViewServerProps, path: string): void {
  const { req } = view.initPageResult
  if (!req.user) redirect(`${req.payload.config.routes.admin}/login?redirect=${encodeURIComponent(`${req.payload.config.routes.admin}${path}`)}`)
}
