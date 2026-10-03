import { Gutter } from '@payloadcms/ui'
import type { BeforeListServerProps, Payload } from 'payload'
import { getPendingCounts } from '../admin/approvals'
import { jobTiles } from '../admin/navigation'
import { isAdminUser } from '../admin/visibility'
import { clubDefaults } from '../seed/club-defaults'
import { dashboardCards } from './dashboardCards'
import { PlayerSyncPanel } from './PlayerSyncPanel'
import { PlayHQRefreshButton } from './PlayHQRefreshButton'

type User = { role?: string | null; name?: string | null; email?: string | null } | null | undefined

function firstName(user: User): string {
  const raw = user?.name?.trim() || user?.email?.split('@')[0] || ''
  return raw.split(/\s+/)[0] ?? ''
}

/**
 * `admin.components.views.dashboard.Component` (RSC): the Home page.
 * Everyone: big job tiles + "Needs your attention". Admins also get a closed "Advanced"
 * section with the old count cards, the PlayHQ refresh, the player sync and the full list.
 */
export async function Dashboard({ payload, user }: { payload: Payload; user?: User }) {
  const adminRoute = payload.config.routes.admin
  const pending = await getPendingCounts(payload)
  const name = firstName(user)
  const admin = isAdminUser(user)

  return (
    <Gutter><section className="club-home" aria-label={`${clubDefaults.name} website admin`}>
      <h1 className="club-home__title">{name ? `Hello, ${name}` : 'Hello'}</h1>
      <p className="club-home__lead">What would you like to do today?</p>

      <ul className="club-tiles">
        {jobTiles.map((tile) => (
          <li key={tile.key}>
            <a className="club-tile" href={`${adminRoute}${tile.path}`}>
              <span className="club-tile__title">{tile.title}</span>
              <span className="club-tile__hint">{tile.hint}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="club-attention" aria-label="Needs your attention">
        <h2 className="club-attention__title">Needs your attention</h2>
        {pending.total === 0 ? (
          <p className="club-attention__none">Nothing is waiting. You are all caught up.</p>
        ) : (
          <ul className="club-attention__list">
            {pending.stories > 0 && (
              <li>
                <a href={`${adminRoute}/collections/stories?where[status][equals]=pending`}>
                  <strong>{pending.stories}</strong> {pending.stories === 1 ? 'story is' : 'stories are'} waiting for approval
                </a>
              </li>
            )}
            {pending.photos > 0 && (
              <li>
                <a href={`${adminRoute}/approvals`}>
                  <strong>{pending.photos}</strong> {pending.photos === 1 ? 'photo is' : 'photos are'} waiting for approval
                </a>
              </li>
            )}
          </ul>
        )}
      </div>

      {admin && (
        <details className="club-advanced">
          <summary>Advanced (site administrators)</summary>
          <ul className="club-dashboard__cards">
            {dashboardCards.map((card) => (
              <li key={`${card.collection}-${card.label}`}>
                <a
                  className="club-dashboard__card"
                  href={`${adminRoute}/collections/${card.collection}${card.listQuery ? `?${card.listQuery}` : ''}`}
                >
                  <span className="club-dashboard__label">{card.label}</span>
                  <span className="club-dashboard__note">{card.note}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="club-dashboard__panels">
            <div className="club-dashboard__panel">
              <h2>PlayHQ</h2>
              <p>Fixtures, results and ladders refresh on their own every 30 minutes. Refresh now if results were just entered.</p>
              <PlayHQRefreshButton />
            </div>
            <div className="club-dashboard__panel">
              <h2>How this site works</h2>
              <ul>
                <li>Documents, photos, sponsors and contacts are read from the database on every visit, so saves are visible immediately.</li>
                <li>Fixtures, results and scorecards come from PlayHQ and are cached for up to 30 minutes.</li>
                <li>Files you upload are stored with the site host; deleting an item also removes its file.</li>
              </ul>
            </div>
          </div>
          <PlayerSyncPanel {...({ payload } as BeforeListServerProps)} />
        </details>
      )}
    </section></Gutter>
  )
}
