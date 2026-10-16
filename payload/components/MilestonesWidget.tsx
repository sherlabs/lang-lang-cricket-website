// @committee-facing
import { CLUB_LOCALE } from '@/config/site'
import { homeMilestoneRows, type HomeMilestoneRow } from '@/lib/admin/home-milestones'
import type { Payload } from 'payload'
import { DEFAULT_STATS_SETTINGS, resolveStatsSettings } from '../../lib/site-settings-core'
import { filterRows } from '../../lib/stats/leaderboard'
import { buildMilestoneBoard } from '../../lib/stats/milestones'
import { getAllMilestonePlayersForAdmin, getAllStatRowsForAdmin } from '../../lib/stats/queries'
import { coverage, currentSeasonName } from '../../lib/stats/season-window'
import { Card, Section } from './ui/Card'
import { StatusPill } from './ui/StatusPill'

/** Plain data for the widget; any failure becomes `null` so the dashboard still renders. */
async function load(payload: Payload): Promise<HomeMilestoneRow[] | null> {
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
    const hidden = new Set(hiddenDocs.docs.map((d) => d.id))
    const board = buildMilestoneBoard({
      players, rows, windowStart, currentSeason: currentSeasonName(rows), onlyActive: false,
      config: { thresholds: settings.milestoneThresholds, window: settings.approachWindow },
    })
    const flag = (id: number) => hidden.has(id)
    return homeMilestoneRows({
      achieved: board.achievedNow.map((a) => ({ playerId: a.playerId, name: a.name, hidden: flag(a.playerId), key: a.key, threshold: a.threshold })),
      approaching: board.approaching.map((a) => ({ playerId: a.playerId, name: a.name, hidden: flag(a.playerId), key: a.key, threshold: a.threshold, remaining: a.remaining })),
    }, CLUB_LOCALE)
  } catch {
    return null
  }
}

/**
 * Home "Milestones" card (spec A8): up to four players close to a round number, with the gap in one short line ("2 runs from 1,000")
 * and a link to the full list. Staff see every player, including inactive and hidden ones. Server component; reads the admin-only,
 * uncached stat queries, and a failure only hides the card.
 */
export async function MilestonesWidget({ payload }: { payload: Payload }) {
  const rows = await load(payload)
  const admin = payload.config.routes.admin
  if (rows === null || rows.length === 0) return null
  return (
    <Section title="Milestones" id="milestones" action={<a className="club-link" href="/stats">See all</a>} className="club-home__milestones">
      <Card tone="plain" className="club-milestones">
        <ul className="club-milestones__list">
          {rows.map((r) => (
            <li key={r.key} className="club-milestones__row">
              <span className="club-milestones__avatar" aria-hidden="true">{r.initials}</span>
              <span className="club-milestones__who">
                <a href={`${admin}/collections/players/${r.playerId}`}>{r.name}</a>
                {r.hidden ? <StatusPill tone="neutral">Hidden</StatusPill> : null}
              </span>
              <span className="club-milestones__text">{r.text}</span>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  )
}
