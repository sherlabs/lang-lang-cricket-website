import { moreTied, take } from '../records'
import { rankValues } from '../rank'
import { smallEventSample } from './board'
import { countsByPlayer } from './counts'
import { coverageCaption, coverageOf, type MatchCoverage } from './coverage'
import { getMatchMetric, rankMatchBy } from './metrics'
import type { MatchMinimums } from './minimums'
import { bestByWicket, topPartnerships, unavailableText } from './partnerships'
import type { FactSet, MatchHeader, PartnershipFact, PartnershipReason } from './types'

/**
 * Club records from the stored matches (W2 spec 4.2). Every list says "from match data" and counts
 * recorded innings only. Lowest totals appear only as "lowest completed innings" (an innings that
 * ended all out): a chase, declaration or short innings says nothing about a low score.
 */
export type MatchRecordEntry = { rank: number; playerId: number | null; display: string; detail: string | null }
export type MatchRecordList = { key: string; title: string; entries: MatchRecordEntry[]; moreTied: number }

const COUNT_LISTS: { key: string; title: string; metric: string }[] = [
  { key: 'fifties', title: 'Most fifties', metric: 'fifties' },
  { key: 'hundreds', title: 'Most hundreds', metric: 'hundreds' },
  { key: 'fiveFors', title: 'Most five-wicket hauls (recorded)', metric: 'fiveFors' },
  { key: 'runOuts', title: 'Most run outs (recorded)', metric: 'runOuts' },
  { key: 'stumpings', title: 'Most stumpings (recorded)', metric: 'stumpings' },
]
/** Ducks sit last, under a neutral heading. */
const DUCKS = { key: 'ducks', title: 'Most ducks', metric: 'ducks' }

const detailOf = (h: MatchHeader | undefined, gradeLabel: (g: string | null) => string | null): string | null =>
  h ? [h.date, `v ${h.oppLabel}`, gradeLabel(h.grade)].filter(Boolean).join(' · ') : null

export type MatchRecords = {
  coverage: MatchCoverage
  caption: string
  /** Fewer than five run outs and stumpings in the data: the page adds a small-sample note. */
  smallEventSample: boolean
  counts: MatchRecordList[]
  ducks: MatchRecordList
  highestScores: MatchRecordList
  bestFigures: MatchRecordList
  lowestCompleted: MatchRecordList
}

export function buildMatchRecords(set: FactSet, min: MatchMinimums, gradeLabel: (g: string | null) => string | null = (g) => g): MatchRecords {
  const coverage = coverageOf(set)
  const by = countsByPlayer(set)
  const items = [...by].map(([playerId, counts]) => ({ playerId, counts }))
  const list = (def: { key: string; title: string; metric: string }): MatchRecordList => {
    const { ranked } = rankMatchBy(items, getMatchMetric(def.metric)!, min)
    return { key: def.key, title: def.title, moreTied: moreTied(ranked), entries: take(ranked).map((r) => ({ rank: r.rank, playerId: r.item.playerId, display: r.display, detail: null })) }
  }

  const scores = set.bat
    .map((b) => ({ b, value: b.runs + (b.status === 'not_out' ? 0.5 : 0) }))
    .filter((x) => x.b.runs > 0)
  const topScores = take(rankValues(scores, (x) => x.value, true))
  const figures = set.bowl.filter((w) => w.wickets > 0).map((w) => ({ w, value: w.wickets * 1000 - w.runs }))
  const topFigures = take(rankValues(figures, (x) => x.value, true))
  const completed = [...set.innings.values()].filter((i) => i.clubBatting && i.allOut)
  const lowest = take(rankValues(completed, (i) => i.runs, false))

  return {
    coverage,
    caption: coverageCaption(coverage),
    smallEventSample: smallEventSample({ key: 'runOuts' }, items.map((i) => i.counts)),
    counts: COUNT_LISTS.map(list),
    ducks: list(DUCKS),
    highestScores: {
      key: 'highestScores', title: 'Highest scores', moreTied: moreTied(topScores),
      entries: topScores.map((r) => ({ rank: r.rank, playerId: r.item.b.player, display: `${r.item.b.runs}${r.item.b.status === 'not_out' ? '*' : ''}`, detail: detailOf(set.matches.get(r.item.b.m), gradeLabel) })),
    },
    bestFigures: {
      key: 'bestFigures', title: 'Best innings bowling figures (recorded)', moreTied: moreTied(topFigures),
      entries: topFigures.map((r) => ({ rank: r.rank, playerId: r.item.w.player, display: `${r.item.w.wickets}/${r.item.w.runs}`, detail: detailOf(set.matches.get(r.item.w.m), gradeLabel) })),
    },
    lowestCompleted: {
      key: 'lowestCompleted', title: 'Lowest completed innings', moreTied: moreTied(lowest),
      entries: lowest.map((r) => ({ rank: r.rank, playerId: null, display: `${r.item.runs}`, detail: detailOf(set.matches.get(r.item.m), gradeLabel) })),
    },
  }
}

export type PartnershipRecordLine = { rank: number; p: PartnershipFact; header: MatchHeader | undefined }

/** Best public pair at each wicket, 1 to 10. A wicket with no public pair is absent (never a zero). */
export function partnershipRecordsByWicket(set: FactSet): PartnershipRecordLine[] {
  return [...bestByWicket(set.partnerships)].sort(([a], [b]) => a - b).map(([, p]) => ({ rank: 1, p, header: set.matches.get(p.m) }))
}

export function partnershipTop(set: FactSet, n = 25): PartnershipRecordLine[] {
  return topPartnerships(set.partnerships, n).map(({ rank, p }) => ({ rank, p, header: set.matches.get(p.m) }))
}

/** "N of M club batting innings have complete fall of wickets. K of M innings unavailable (2 retirement, ...)." */
export function partnershipCoverageText(set: FactSet): string {
  const batting = [...set.innings.values()].filter((i) => i.clubBatting)
  const ok = batting.filter((i) => i.partnerships === 'ok').length
  const reasons: Partial<Record<PartnershipReason, number>> = {}
  for (const i of batting) if (i.partnerships && i.partnerships !== 'ok') reasons[i.partnerships] = (reasons[i.partnerships] ?? 0) + 1
  const un = unavailableText(reasons, batting.length)
  return `${ok} of ${batting.length} club batting innings have complete fall of wickets.${un ? ` ${un.charAt(0).toUpperCase()}${un.slice(1)}.` : ''}`
}
