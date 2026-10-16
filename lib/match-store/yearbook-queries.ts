import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { cached } from '@/lib/stats/queries'
import { getLabelMap } from '@/lib/stats/label-queries'
import { canonicalGrade, canonicalTeam } from '@/lib/stats/labels'
import { classifyGrade, type GradeCategory, type GradeRule } from '@/lib/stats/categories'
import { resultLineOf, type ResultLine } from '@/lib/stats/match/yearbook'
import { emptyFactSet, type FactSet } from '@/lib/stats/match/types'
import { seasonParts } from '@/lib/stats/yearbook'
import { readStoredBundles } from './read'
import { filterMatchFacts, getSeasonFacts, NO_YEAR_SEASON } from './stats-queries'

/**
 * The stored matches of one yearbook season (W2 spec 5.5). The result lines carry club and opposition
 * team scores only (no player data); the fact set is the cached season blob, visible players only.
 * Every query restates FINAL-only; the stats tags expire both after a sync, hide, merge or settings save.
 */
async function loadResultLines(seasonName: string): Promise<ResultLine[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, { seasonName: { equals: seasonName } }] },
    pagination: false, depth: 0, sort: 'id', select: { gameId: true },
  })
  const gameIds = docs.map((d) => String(d.gameId))
  if (gameIds.length === 0) return []
  const bundles = await readStoredBundles(payload, { gameIds })
  return bundles.flatMap((b) => { const l = resultLineOf(b); return l ? [l] : [] })
}

export type YearbookMatchData = { lines: ResultLine[]; set: FactSet }

/** Result lines and facts of the season, in the given grade categories. Empty when nothing is stored; null if unreadable. */
export async function getYearbookMatchData(seasonName: string, o: { cats: readonly GradeCategory[]; rules: readonly GradeRule[] }): Promise<YearbookMatchData | null> {
  try {
    const year = seasonParts(seasonName)?.start ?? NO_YEAR_SEASON
    const [lines, all] = await Promise.all([cached(['yearbook-result-lines', 'v1', seasonName], () => loadResultLines(seasonName)), getSeasonFacts(year)])
    const labels = await getLabelMap()
    const tidy = lines.map((l) => ({ ...l, grade: l.grade ? canonicalGrade(l.grade, labels) : l.grade, team: canonicalTeam(l.team, labels) }))
    const keep = tidy.filter((l) => o.cats.includes(classifyGrade(l.grade, l.team, o.rules)))
    const set = filterMatchFacts(all, { cats: o.cats, rules: o.rules, season: seasonName })
    return { lines: keep, set: set.matches.size ? set : emptyFactSet() }
  } catch (err) {
    console.warn('[yearbook] match data unavailable:', (err as Error).message)
    return null
  }
}
