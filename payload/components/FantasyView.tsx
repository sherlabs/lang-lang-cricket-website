// @committee-facing
import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { getAdminData } from '@/lib/fantasy/admin-view'
import { isAdminUser, isStaffUser } from '../access'
import { AdminPage, requireStaff } from './AdminPage'
import { FantasyPanel } from './FantasyPanel'
import { PageHeader } from './ui'

/**
 * `/admin/fantasy` (custom view, admin and editor): the club fantasy game. It leads with This week (the share link, the lock, who has
 * picked, the public switch), then closed-by-default sections for prices, rounds and managers. The staff check is repeated here and
 * in every action; a selector never reaches it. No PIN or hash is ever read for this page.
 */
export async function FantasyView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/fantasy')
  if (denied !== null) return denied
  const { req } = view.initPageResult
  if (!isStaffUser(req.user)) {
    return (
      <AdminPage view={view}>
        <PageHeader title="Fantasy cricket" lead={<>Only the committee can manage the fantasy game.</>} />
      </AdminPage>
    )
  }
  const data = await getAdminData(req.payload, isAdminUser(req.user))
  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Fantasy cricket' }]} />
      <PageHeader title="Fantasy cricket" lead={<>A free game for members: pick a squad within a salary cap and score points from real club games. Share the link below; there are no accounts, only a team name and a PIN. No prizes or entry fees.</>} />
      <FantasyPanel data={data} csvHref="/api/admin/fantasy/leaderboard" />
    </AdminPage>
  )
}
