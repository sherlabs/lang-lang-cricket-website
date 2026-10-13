// @committee-facing
import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { AdminPage, requireStaff } from './AdminPage'
import { Card } from './ui/Card'
import { PageHeader } from './ui/PageHeader'
import { helpContacts, helpIntro, helpSections } from '../admin/helpContent'

/** `/admin/help` (custom view): a one-page guide. The words live in `payload/admin/helpContent.ts`. */
export async function HelpView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/help')
  if (denied !== null) return denied
  return (
    <AdminPage view={view} className="club-help">
      <SetStepNav nav={[{ label: 'Help' }]} />
      <PageHeader title="Help" lead={helpIntro} />

      <ul className="club-help__jump">
        {helpSections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`}>{s.title}</a>
          </li>
        ))}
      </ul>

      {helpSections.map((s) => (
        <Card as="section" key={s.id} id={s.id} className="club-help__section ui-stack">
          <h2>{s.title}</h2>
          <ol>
            {s.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Card>
      ))}

      <Card as="section" className="club-help__section ui-stack">
        <h2>Who to call</h2>
        <ul>
          {helpContacts.map((c) => (
            <li key={c.who}>
              <strong>{c.who}</strong> {c.how}
            </li>
          ))}
        </ul>
      </Card>
    </AdminPage>
  )
}
