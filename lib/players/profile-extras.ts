import type { PlayerSeason } from '@/lib/domain'
import type { StatsSettings } from '@/lib/site-settings-core'
import { careerOf, mergeBySeason, type SeasonRow, type StatRow } from '@/lib/stats/aggregate'
import { classifyGrade } from '@/lib/stats/categories'
import { filterRows } from '@/lib/stats/leaderboard'
import { bestWorstSeasons, hasBatting, hasBowling, progressionSeries, type BestWorst, type Series } from '@/lib/stats/progression'
import { LEADERBOARD_METRIC_KEYS, getMetric } from '@/lib/stats/metrics'
import { milestonesFor, NO_BASELINE, type Baseline, type PlayerMilestones } from '@/lib/stats/milestones'
import { badgeFor, rankBy, type Badge } from '@/lib/stats/rank'
import { currentSeasonName } from '@/lib/stats/season-window'
import { pickCounts, type SeasonCounts } from './season-math'

/**
 * Profile extras (spec A4): progression series, best/worst seasons, milestone badges, rank
 * badges and the junior toggle. Pure: the page passes in the profile seasons and the cached
 * league rows, so a profile and /stats can never disagree (same filter, merge and ranking code).
 */
export const toStatRow = (s: PlayerSeason): StatRow => ({
  playerId: s.playerId, seasonName: s.seasonName, seasonOrder: s.seasonOrder, teamId: s.teamId, teamName: s.teamName,
  gradeName: s.gradeName, counts: pickCounts(s),
})

/** Junior rows are left off a profile unless asked for (`?juniors=1`); no other category is hidden. */
export function splitJuniorSeasons(seasons: readonly PlayerSeason[], rules: StatsSettings['gradeRules'], includeJuniors: boolean) {
  const isJunior = (s: PlayerSeason) => classifyGrade(s.gradeName, s.teamName, rules) === 'junior'
  const hasJuniorRows = seasons.some(isJunior)
  return { hasJuniorRows, seasons: includeJuniors ? [...seasons] : seasons.filter((s) => !isJunior(s)) }
}

export type RankInfo = { key: string; label: string; rank: number; badge: Badge; display: string }

/**
 * Top-3 places in any default-scope (since-window, all grades, default categories) leaderboard
 * metric the player qualifies for. Same filter + career merge + `rankBy` as /stats.
 */
export function rankBadgesFor(playerId: number, leagueRows: readonly StatRow[], settings: StatsSettings): RankInfo[] {
  const rows = filterRows(leagueRows, { cats: settings.defaultIncludedCategories, rules: settings.gradeRules })
  const items = careerOf(rows).map((c) => ({ playerId: c.playerId, counts: c.counts }))
  const out: RankInfo[] = []
  for (const key of LEADERBOARD_METRIC_KEYS) {
    const metric = getMetric(key)!
    const hit = rankBy(items, metric, settings.qualification.career).ranked.find((r) => r.item.playerId === playerId)
    const badge = hit ? badgeFor(hit.rank) : null
    if (hit && badge) out.push({ key, label: metric.label, rank: hit.rank, badge, display: hit.display })
  }
  return out
}

export type ProfileExtras = {
  seasonRows: SeasonRow[]
  series: Series[]
  bestWorst: Record<string, BestWorst>
  milestones: PlayerMilestones
  ranks: RankInfo[]
  /** Honest derivations from single-value fields: ever scored 100+, ever took 5+ in an innings. */
  centurion: boolean
  fiveWicketHaul: boolean
  hasBatting: boolean
  hasBowling: boolean
  currentSeason: string | null
}

export function buildProfileExtras(o: {
  playerId: number
  /** The seasons being shown (junior filter already applied). */
  seasons: readonly PlayerSeason[]
  career: SeasonCounts | null
  leagueRows: readonly StatRow[]
  settings: StatsSettings
  manualYears: string
  baseline?: Baseline
}): ProfileExtras {
  const seasonRows = mergeBySeason(o.seasons.map(toStatRow))
  // Milestones and ranks follow the /stats and /players defaults: junior rows never count toward them.
  const senior = o.seasons.filter((s) => classifyGrade(s.gradeName, s.teamName, o.settings.gradeRules) !== 'junior')
  const milestoneRows = mergeBySeason(senior.map(toStatRow))
  const windowStart = o.leagueRows.length
    ? [...o.leagueRows].sort((a, b) => b.seasonOrder - a.seasonOrder)[0].seasonName
    : null
  return {
    seasonRows,
    series: progressionSeries(seasonRows),
    bestWorst: bestWorstSeasons(seasonRows, o.settings.qualification.season),
    milestones: milestonesFor({
      seasons: milestoneRows, baseline: o.baseline ?? NO_BASELINE, manualYears: o.manualYears, windowStart,
      config: { thresholds: o.settings.milestoneThresholds, window: o.settings.approachWindow },
    }),
    ranks: rankBadgesFor(o.playerId, o.leagueRows, o.settings),
    centurion: (o.career?.batHighScore ?? 0) >= 100,
    fiveWicketHaul: (o.career?.bowlBalls ?? 0) > 0 && (o.career?.bowlBestWickets ?? 0) >= 5,
    hasBatting: hasBatting(seasonRows),
    hasBowling: hasBowling(seasonRows),
    currentSeason: currentSeasonName(o.leagueRows),
  }
}
