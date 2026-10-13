import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import type { ReactNode } from 'react'

/**
 * The frame every custom admin view sits in (wave G WP-1): Payload's template (sidebar, header) with the page gutter and the one
 * `main` landmark (`#admin-main`, the skip link's target). Presentational only; the sign-in gate and the timing log live in
 * `AdminPage.tsx`, which wraps this.
 */
export function AdminShell({ view, children, className = '' }: { view: AdminViewServerProps; children: ReactNode; className?: string }) {
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
        <main id="admin-main" className={`club-page ${className}`.trim()}>
          {children}
        </main>
      </Gutter>
    </DefaultTemplate>
  )
}
