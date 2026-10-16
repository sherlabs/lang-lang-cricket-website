import type { Payload } from 'payload'
import { getClub } from '@/lib/club'
import { getAdminTheme } from '@/lib/theme'
import { getPendingCounts } from '../admin/approvals'
import { navFor } from '../admin/navigation'
import { NavLinks } from './NavLinks'
import { NavSlideOver, SkipLink } from './NavBehaviour'

/**
 * `admin.components.beforeNavLinks` (RSC). Payload's own grouped nav is switched off (every collection has `admin.group: false`),
 * so this flat, role-aware menu is the whole sidebar: a crest header with the club's name, task headings with icons, and for
 * admins a closed "Advanced" section. Editors get the everyday list plus the Advanced entries marked `forEditors`.
 * It sits inside Payload's own `Nav`, so Payload's mobile menu button, slide-over and `inert` handling keep working.
 */
export async function AdminNav({ payload, user }: { payload: Payload; user?: { role?: string | null } | null }) {
  const { everyday, advanced } = navFor(user?.role)
  const adminRoute = payload.config.routes.admin
  const [pending, theme, club] = await Promise.all([getPendingCounts(payload), getAdminTheme(), getClub()])
  return (
    <>
      <SkipLink />
      <a className="club-nav__brand" href={adminRoute || '/'} aria-label={`${club.name}: admin home`}>
        <span className="club-nav__crest">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.crest.url} alt="" width={32} height={40} />
        </span>
        <span className="club-nav__brand-text">
          <span className="club-nav__club">{club.name}</span>
          <span className="club-nav__product">Website admin</span>
        </span>
      </a>
      <NavLinks adminRoute={adminRoute} everyday={everyday} advanced={advanced} badges={{ approvals: pending.total }} />
      <NavSlideOver />
    </>
  )
}
