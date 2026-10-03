import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { AdminPage, requireUser } from './AdminPage'
import { helpContacts, helpIntro, helpSections } from '../admin/helpContent'

/** `/admin/help` (custom view): a one-page guide. The words live in `payload/admin/helpContent.ts`. */
export function HelpView(view: AdminViewServerProps) {
  requireUser(view, '/help')
  return (
    <AdminPage view={view} className="club-help">
      <SetStepNav nav={[{ label: 'Help' }]} />
      <h1 className="club-page__title">Help</h1>
      <p className="club-page__lead">{helpIntro}</p>

      <ul className="club-help__jump">
        {helpSections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`}>{s.title}</a>
          </li>
        ))}
      </ul>

      {helpSections.map((s) => (
        <section key={s.id} id={s.id} className="club-help__section">
          <h2>{s.title}</h2>
          <ol>
            {s.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}

      <section className="club-help__section">
        <h2>Who to call</h2>
        <ul>
          {helpContacts.map((c) => (
            <li key={c.who}>
              <strong>{c.who}</strong> {c.how}
            </li>
          ))}
        </ul>
      </section>
    </AdminPage>
  )
}
