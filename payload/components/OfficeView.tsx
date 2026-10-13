import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { landingStats } from '@/lib/office/landing'
import { modulesFor } from '@/lib/office/modules'
import { officeCopy } from '../admin/copy'
import { isStaffUser } from '../access'
import { AdminPage, requireStaff } from './AdminPage'

/**
 * `/admin/office` (custom view, admin and editor): the landing page of the club back office. One tile per module the signed-in
 * role may use, each with one honest stat line. Editors see only the committee-level modules; members, the exports and sends log
 * and the office settings are for admins.
 */
export async function OfficeView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/office')
  if (denied !== null) return denied
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const role = isStaffUser(req.user) ? (req.user as { role?: string }).role : null
  const modules = modulesFor(role)
  const stats = await landingStats(req.user, modules.map((m) => m.key))
  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office' }]} />
      <h1 className="club-page__title">Club office</h1>
      <p className="club-page__lead">The club&rsquo;s back office in one place. Pick a tile to get started.</p>
      {modules.length === 0 ? (
        <p className="club-attention__none">{officeCopy.landing.empty}</p>
      ) : (
        <ul className="club-tiles">
          {modules.map((m) => (
            <li key={m.key}>
              <a className="club-tile" href={`${admin}${m.path}`}>
                <span className="club-tile__title">{m.label}</span>
                <span className="club-tile__hint">{m.hint}</span>
                {stats[m.key] ? <span className="office-stat">{stats[m.key]}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      )}
      {role === 'admin' ? (
        <p className="club-page__lead office-footer-links">
          <a href={`${admin}/globals/office-settings`}>Club office settings</a> &middot; <a href={`${admin}/collections/office-audit-log`}>Exports and sends log</a>
        </p>
      ) : (
        <p className="club-muted">{officeCopy.landing.adminOnlyNote}</p>
      )}
    </AdminPage>
  )
}
