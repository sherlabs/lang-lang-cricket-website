import 'server-only'
import { filterMatchFacts, getAllFacts, getFactsFor, getOppositionOptions, type OppositionOption } from '@/lib/match-store/stats-queries'
import { getStatsSettings } from '@/lib/site-settings'
import { availableCategories, gradeNames } from './leaderboard'
import { buildLabelMap, canonicalGrade } from './labels'
import { coverageCaption, coverageOf } from './match/coverage'
import { STATLAB_MAX_SEASONS } from './match/limits'
import { emptyFactSet } from './match/types'
import { effectiveCategories, ALL } from './query-string'
import { getMilestonePlayers, getVisibleStatData } from './queries'
import { buildMatchStatLab } from './match-statlab'
import { buildStatLab, parseStatLabParams, statLabMode, type StatLabParams, type StatLabResult } from './statlab'
import { getLabColumn } from './statlab-columns'
import { sinceLabel } from './season-window'

/**
 * The one code path behind both `/statlab` and `/statlab/export`: same parser, same visible-only
 * cached rows, same filters. Only the row cap differs (applied by the caller). The mode rule
 * (`statLabMode`) decides whether the table reads `player-seasons` or the stored match rows; a table
 * never mixes the two.
 */
const seasonYear = (name: string): number | null => {
  const m = /\d{4}/.exec(name)
  return m ? Number(m[0]) : null
}

/** "Season totals since 2023/24" or "From match data, <coverage caption>". */
export function statLabCaption(o: { mode: 'season' | 'match'; since: string; matchCaption: string }): string {
  return (o.mode === 'season' ? `Season totals ${o.since}` : `From match data. ${o.matchCaption}`).replace(/\.$/, '')
}

export async function runStatLab(raw: Parameters<typeof parseStatLabParams>[0]) {
  const [settings, data, milestonePlayers, opps] = await Promise.all([
    getStatsSettings(), getVisibleStatData(), getMilestonePlayers(),
    getOppositionOptions().catch((err): OppositionOption[] => {
      console.warn('[statlab] opposition list unavailable:', (err as Error).message)
      return []
    }),
  ])
  const params = parseStatLabParams(raw, { seasons: data.seasons.map((s) => s.seasonName), grades: gradeNames(data.rows), opps: opps.map((o) => o.key) })
  const cats = effectiveCategories(params, settings.defaultIncludedCategories)
  const activeIds = new Set(milestonePlayers.filter((p) => p.active).map((p) => p.id))
  const { mode, forcedByColumn } = statLabMode(params)
  const since = sinceLabel(data.rows)

  let result: StatLabResult
  let caption: string
  if (mode === 'season') {
    result = buildStatLab(params, { rows: data.rows, players: data.players, cats, rules: settings.gradeRules, activeIds, minimums: settings.matchMinimums })
    caption = statLabCaption({ mode, since: params.season === ALL ? since : `for ${params.season}`, matchCaption: '' })
  } else {
    let set = emptyFactSet()
    let unavailable = false
    try {
      const year = params.season === ALL ? null : seasonYear(params.season)
      const all = year !== null ? await getFactsFor([year]) : await getAllFacts(STATLAB_MAX_SEASONS)
      set = filterMatchFacts(all, {
        cats, rules: settings.gradeRules,
        season: params.season === ALL ? undefined : params.season, grade: params.grade === ALL ? undefined : params.grade,
        oppKey: params.opp === ALL ? undefined : params.opp, format: params.fmt === ALL ? undefined : params.fmt,
      })
    } catch (err) {
      console.warn('[statlab] match data unavailable:', (err as Error).message)
      unavailable = true
    }
    const labels = buildLabelMap([...set.matches.values()].map((h) => ({ kind: 'grade' as const, label: h.grade })))
    result = buildMatchStatLab(params, set, {
      players: data.players, activeIds, minimums: settings.matchMinimums, gradeLabel: (g) => (g ? canonicalGrade(g, labels) : null),
    }, forcedByColumn)
    const need = params.cols.map((c) => getLabColumn(c)?.needs).find((n) => n)
    caption = statLabCaption({ mode, since, matchCaption: unavailable ? 'Match data is unavailable right now.' : coverageCaption(coverageOf(set), need ?? undefined) })
  }
  return { params, result, data, settings, cats, caption, opps, categories: availableCategories(data.rows, settings.gradeRules) }
}

export type StatLabRun = Awaited<ReturnType<typeof runStatLab>>
export type { StatLabParams }
