import type { Payload } from 'payload'
import { clubDefaults } from '../seed/club-defaults'
import { dashboardCards } from './dashboardCards'
import { PlayHQRefreshButton } from './PlayHQRefreshButton'

/**
 * `admin.components.beforeDashboard` (RSC, spec §9): count cards from the registry, the
 * PlayHQ refresh button and the "How this site works" notes.
 */
export async function Dashboard({ payload }: { payload: Payload }) {
  const counts = await Promise.all(
    dashboardCards.map(async (card) => {
      try {
        const { totalDocs } = await payload.count({ collection: card.collection, where: card.where, overrideAccess: true })
        return totalDocs
      } catch {
        return null
      }
    }),
  )
  const adminRoute = payload.config.routes.admin

  return (
    <section className="club-dashboard" aria-label={`${clubDefaults.name} overview`}>
      <ul className="club-dashboard__cards">
        {dashboardCards.map((card, i) => {
          const query = card.listQuery ? `?${card.listQuery}` : ''
          return (
            <li key={`${card.collection}-${card.label}`}>
              <a className="club-dashboard__card" href={`${adminRoute}/collections/${card.collection}${query}`}>
                <span className="club-dashboard__count">{counts[i] ?? '–'}</span>
                <span className="club-dashboard__label">{card.label}</span>
                <span className="club-dashboard__note">{card.note}</span>
              </a>
            </li>
          )
        })}
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
    </section>
  )
}
