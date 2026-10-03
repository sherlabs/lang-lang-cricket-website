import type { Metadata } from 'next'
import { FrontendShell } from './(frontend)/shell'
import NotFound from './(frontend)/not-found'

// Unmatched top-level URLs have no root layout (the app has two route-group
// roots), so Next renders this instead (experimental.globalNotFound).
export const metadata: Metadata = { title: 'Page not found' }

export default function GlobalNotFound() {
  return (
    <FrontendShell>
      <NotFound />
    </FrontendShell>
  )
}
