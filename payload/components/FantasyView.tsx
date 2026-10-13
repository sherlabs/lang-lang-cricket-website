import type { AdminViewServerProps } from 'payload'
import { AdminPage, requireUser } from './AdminPage'

export async function FantasyView(view: AdminViewServerProps) {
  requireUser(view, '/fantasy')
  return (
    <AdminPage view={view}>
      <h1 className="club-page__title">Fantasy cricket</h1>
    </AdminPage>
  )
}
