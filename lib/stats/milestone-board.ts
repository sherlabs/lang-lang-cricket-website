import 'server-only'
import { getStatsSettings } from '@/lib/site-settings'
import { filterRows } from './leaderboard'
import { buildMilestoneBoard } from './milestones'
import { getMilestonePlayers, getVisibleStatData } from './queries'
import { coverage, currentSeasonName, shortSeason } from './season-window'

/** The public milestone strip's data (players and stats pages): approaching and recently achieved. */
export async function milestoneBoard() {
  const [settings, data, players] = await Promise.all([getStatsSettings(), getVisibleStatData(), getMilestonePlayers()])
  const rows = filterRows(data.rows, { cats: settings.defaultIncludedCategories, rules: settings.gradeRules })
  const windowStart = coverage(data.rows)?.from ?? null
  const board = buildMilestoneBoard({
    players, rows, windowStart, currentSeason: currentSeasonName(rows), onlyActive: true,
    config: { thresholds: settings.milestoneThresholds, window: settings.approachWindow },
  })
  const windowLabel = windowStart ? shortSeason(windowStart) : null
  return { ...board, windowLabel, note: windowLabel ? `Counts cover seasons since ${windowLabel} unless an earlier total has been recorded for the player. Updated after each nightly sync.` : '' }
}

