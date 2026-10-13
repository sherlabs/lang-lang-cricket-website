import { dashboardCards } from './dashboardCards'
import { notificationLines } from '@/lib/admin/notifications'
import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'
import type { BeforeListServerProps, Payload } from 'payload'
import type { HomeFacts } from './homeFacts'
import { PlayerSyncPanel } from './PlayerSyncPanel'
import { PlayHQRefreshButton } from './PlayHQRefreshButton'
import { Card } from './ui/Card'

const dateFormat = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Advanced > System health (site administrators only): everything technical that used to sit in the Home list. The latest stats
 * update with its counts and error, the sync controls, the old count cards and a note on how the site works. Not committee-facing.
 */
export async function SystemHealth({ payload, facts }: { payload: Payload; facts: Promise<HomeFacts> }) {
  const adminRoute = payload.config.routes.admin
  const { input } = await facts
  const lines = input ? notificationLines(input, { isAdmin: true, adminRoute, now: new Date(), formatDate: (d) => dateFormat.format(d) }) : []
  return (
    <div id="system-health" className="club-health">
      <h2 className="club-health__title">System health</h2>
      {lines.length > 0 && (
        <ul className="club-health__lines">
          {lines.map((l) => (
            <li key={l.key} data-tone={l.tone}>
              {l.text}
              {l.href && l.linkText ? <> <a href={l.href}>{l.linkText}</a></> : null}
            </li>
          ))}
        </ul>
      )}
      <ul className="club-dashboard__cards">
        {dashboardCards.map((card) => (
          <li key={`${card.collection}-${card.label}`}>
            <a className="club-dashboard__card" href={`${adminRoute}/collections/${card.collection}${card.listQuery ? `?${card.listQuery}` : ''}`}>
              <span className="club-dashboard__label">{card.label}</span>
              <span className="club-dashboard__note">{card.note}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="club-dashboard__panels">
        <Card className="club-dashboard__panel">
          <h3>PlayHQ</h3>
          <p>Fixtures, results and ladders refresh on their own every 30 minutes. Refresh now if results were just entered.</p>
          <PlayHQRefreshButton />
        </Card>
        <Card className="club-dashboard__panel">
          <h3>How this site works</h3>
          <ul>
            <li>Documents, photos, sponsors and contacts are read from the database on every visit, so saves are visible immediately.</li>
            <li>Fixtures, results and scorecards come from PlayHQ and are cached for up to 30 minutes.</li>
            <li>Files you upload are stored with the site host; deleting an item also removes its file.</li>
          </ul>
        </Card>
      </div>
      <PlayerSyncPanel {...({ payload } as BeforeListServerProps)} />
    </div>
  )
}
