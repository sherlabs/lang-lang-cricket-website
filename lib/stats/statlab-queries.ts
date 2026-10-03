import 'server-only'
import { getStatsSettings } from '@/lib/site-settings'
import { availableCategories, gradeNames } from './leaderboard'
import { effectiveCategories } from './query-string'
import { getMilestonePlayers, getVisibleStatData } from './queries'
import { buildStatLab, parseStatLabParams } from './statlab'

/**
 * The one code path behind both `/statlab` and `/statlab/export`: same parser, same visible-only
 * cached rows, same filters. Only the row cap differs (applied by the caller).
 */
export async function runStatLab(raw: Parameters<typeof parseStatLabParams>[0]) {
  const [settings, data, milestonePlayers] = await Promise.all([getStatsSettings(), getVisibleStatData(), getMilestonePlayers()])
  const params = parseStatLabParams(raw, { seasons: data.seasons.map((s) => s.seasonName), grades: gradeNames(data.rows) })
  const cats = effectiveCategories(params, settings.defaultIncludedCategories)
  const result = buildStatLab(params, {
    rows: data.rows,
    players: data.players,
    cats,
    rules: settings.gradeRules,
    activeIds: new Set(milestonePlayers.filter((p) => p.active).map((p) => p.id)),
  })
  return { params, result, data, settings, cats, hasJuniors: availableCategories(data.rows, settings.gradeRules).includes('junior') }
}
