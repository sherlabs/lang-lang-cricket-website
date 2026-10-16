// @committee-facing
import type { Payload } from 'payload'
import { roleLabel } from '../admin/navigation'
import { Icon } from './ui/Icon'

type User = { role?: string | null; name?: string | null; email?: string | null } | null | undefined

/**
 * `admin.components.afterNavLinks` (RSC): who is signed in, in plain words, and a labelled "Sign out" (Payload's own icon-only
 * logout is hidden by CSS so there is one clear way out). The role is shown as "Site admin" or "Committee", never the raw value.
 */
export function AdminNavUser({ payload, user }: { payload: Payload; user?: User }) {
  const adminRoute = payload.config.routes.admin
  const name = user?.name?.trim() || user?.email?.split('@')[0] || 'Signed in'
  return (
    <div className="club-nav__user">
      <a className="club-nav__who" href={`${adminRoute}/account`}>
        <Icon name="account" size={20} className="club-nav__icon" />
        <span className="club-nav__who-text">
          <span className="club-nav__who-name">{name}</span>
          <span className="club-nav__who-role">{roleLabel(user?.role)}</span>
        </span>
      </a>
      <a className="club-nav__signout" href={`${adminRoute}/logout`}>
        <Icon name="signout" size={18} />
        Sign out
      </a>
    </div>
  )
}
