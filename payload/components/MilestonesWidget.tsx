import type { Payload } from 'payload'
import { DEFAULT_STATS_SETTINGS, resolveStatsSettings } from '../../lib/site-settings-core'
import { filterRows } from '../../lib/stats/leaderboard'
import { buildMilestoneBoard, describeAchieved, describeApproaching } from '../../lib/stats/milestones'
import { getAllMilestonePlayersForAdmin, getAllStatRowsForAdmin } from '../../lib/stats/queries'
import { coverage, currentSeasonName, shortSeason } from '../../lib/stats/season-window'

type Item = { key: string; id: number; name: string; hidden: boolean; text: string }

/** Plain data for the widget; any failure becomes `null` so the dashboard still renders. */
async function load(payload: Payload): Promise<Item[] | null> {
  try {
    const [data, players, settingsDoc, hiddenDocs] = await Promise.all([
      getAllStatRowsForAdmin(),
      getAllMilestonePlayersForAdmin(),
      payload.findGlobal({ slug: 'site-settings', depth: 0 }).catch(() => null),
      payload.find({ collection: 'players', where: { hidden: { equals: true } }, pagination: false, depth: 0, joins: false, select: { hidden: true } }),
    ])
    const settings = settingsDoc?.updatedAt ? resolveStatsSettings((settingsDoc as unknown as { stats?: unknown }).stats) : DEFAULT_STATS_SETTINGS
    const rows = filterRows(data.rows, { cats: settings.defaultIncludedCategories, rules: settings.gradeRules })
    const windowStart = coverage(data.rows)?.from ?? null
    const label = windowStart ? shortSeason(windowStart) : null
    const hidden = new Set(hiddenDocs.docs.map((d) => d.id))
    const board = buildMilestoneBoard({
      players, rows, windowStart, currentSeason: currentSeasonName(rows), onlyActive: false,
      config: { thresholds: settings.milestoneThresholds, window: settings.approachWindow },
    })
    return [
      ...board.achievedNow.slice(0, 20).map((a) => ({ key: `r-${a.playerId}-${a.key}-${a.threshold}`, id: a.playerId, name: a.name, hidden: hidden.has(a.playerId), text: describeAchieved(a, label) })),
      ...board.approaching.slice(0, 20).map((a) => ({ key: `a-${a.playerId}-${a.key}-${a.threshold}`, id: a.playerId, name: a.name, hidden: hidden.has(a.playerId), text: describeApproaching(a) })),
    ]
  } catch {
    return null
  }
}

/**
 * Dashboard "Milestones" widget (spec A8): players approaching round numbers, including inactive
 * and hidden players (staff see everything), with the remaining count and a link to the player.
 * Server component; reads the admin-only, uncached stat queries.
 */
export async function MilestonesWidget({ payload }: { payload: Payload }) {
  const items = await load(payload)
  const admin = payload.config.routes.admin
  return (
    <div className="club-dashboard__panel">
      <h2>Milestones</h2>
      <p>Totals cover the seasons PlayHQ still lists unless a pre-PlayHQ baseline is set on the player. Updated by the nightly sync.</p>
      {items === null ? (
        <p>Milestones could not be loaded.</p>
      ) : items.length === 0 ? (
        <p>Nobody is close to a milestone right now.</p>
      ) : (
        <ul>
          {items.map((i) => (
            <li key={i.key}>
              <a href={`${admin}/collections/players/${i.id}`}>{i.name}</a>
              {i.hidden ? ' (hidden)' : ''}: {i.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
