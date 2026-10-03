import type { Payload } from 'payload'
import { getPendingCounts } from '../admin/approvals'
import { navFor } from '../admin/navigation'
import { NavLinks } from './NavLinks'

/**
 * `admin.components.beforeNavLinks` (RSC). Payload's own grouped nav is switched off (every
 * collection has `admin.group: false`), so this flat, role-aware menu is the whole sidebar.
 * Editors get the everyday list; admins get the same plus an "Advanced" section.
 */
export async function AdminNav({ payload, user }: { payload: Payload; user?: { role?: string | null } | null }) {
  const { everyday, advanced } = navFor(user?.role)
  const pending = await getPendingCounts(payload)
  return <NavLinks adminRoute={payload.config.routes.admin} everyday={everyday} advanced={advanced} badges={{ approvals: pending.total }} />
}
