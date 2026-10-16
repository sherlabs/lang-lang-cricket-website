// @committee-facing
import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { CLUB_LOCALE, SELECTOR_INVITE_DAYS, VOTES, votePaths } from '@/config/site'
import { facebookConfig } from '@/lib/facebook-login'
import { selectorStatus, STATUS_LABEL } from '@/lib/selector-status'
import { isStaffUser } from '../access'
import { AdminPage, requireStaff } from './AdminPage'
import { SelectorsPanel, type SelectorRow } from './SelectorsPanel'
import { PageHeader } from './ui'

const when = new Intl.DateTimeFormat(CLUB_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * `/admin/selectors` (custom view, admin and editor): the people who pick the teams. Add one (name and email), share the invite
 * link, and manage the logins. Reads with the Local API after the staff check; the invite token and the Facebook id are never read.
 */
export async function SelectorsView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/selectors')
  if (denied !== null) return denied
  const { req } = view.initPageResult
  const api = req.payload.config.routes.api
  if (!isStaffUser(req.user)) {
    return (
      <AdminPage view={view}>
        <PageHeader title="Selectors" lead={<>Only the committee can manage selector logins.</>} />
      </AdminPage>
    )
  }
  const found = await req.payload.find({
    collection: 'users',
    where: { role: { equals: 'selector' } },
    sort: 'name',
    limit: 200,
    depth: 0,
    overrideAccess: true,
    select: { name: true, email: true, disabled: true, lastLoginAt: true, lastLoginMethod: true, inviteExpiresAt: true, facebookLinkedAt: true },
  })
  const rows: SelectorRow[] = found.docs.map((u) => {
    const status = selectorStatus(u)
    return {
      id: u.id,
      name: u.name ?? '',
      email: u.email,
      status,
      statusLabel: STATUS_LABEL[status],
      facebookLinked: Boolean(u.facebookLinkedAt),
      lastSignIn: u.lastLoginAt ? `${when.format(new Date(u.lastLoginAt))}${u.lastLoginMethod === 'facebook' ? ' (Facebook)' : ''}` : null,
    }
  })
  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Selectors' }]} />
      <PageHeader title="Selectors" lead={<>Selectors pick the team for each grade and announce it. They sign in on the website, never here. Add a name and email, then send them the link.</>} />
      <p className="club-page__lead">
        Run the player votes, see who has voted and open the leaderboard: <a href={votePaths.selector}>{VOTES.label} votes</a> (opens the selector area).
      </p>
      <SelectorsPanel api={api} rows={rows} facebookOn={Boolean(facebookConfig())} inviteDays={SELECTOR_INVITE_DAYS} />
    </AdminPage>
  )
}
