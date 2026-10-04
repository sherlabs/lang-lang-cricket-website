import type { SeasonCounts } from '@/lib/players/season-math'
import { GROUP_LABELS, GROUPS, METRICS, type MetricGroup } from './metrics'
import { MATCH_METRICS, matchQualifies } from './match/metrics'
import type { MatchMinimums } from './match/minimums'
import type { MatchCounts } from './match/types'

/**
 * StatLab column registry (W2 spec 5.1): the 26 season-total metrics plus the match-only ones, behind
 * one `LabColumn` shape. A match-only column exists only in match mode (it forces the mode), and its
 * value is `null` (shown as a dash) when the rows behind it are too few or missing, never zero.
 */
export type PartnershipCells = {
  /** Innings the player batted in whose partnerships could be derived (the denominator). */
  innings: number
  best: number | null
  fifties: number
}

export type MatchCells = { counts: MatchCounts; partnerships: PartnershipCells }

/** What a column reads: season-style counts always, match cells in match mode only. */
export type LabCells = { counts: SeasonCounts; match: MatchCells | null }

export type LabColumn = {
  key: string
  label: string
  short: string
  group: MetricGroup
  /** True for a match-only column: selecting it puts the table in match mode. */
  matchOnly: boolean
  higherIsBetter: boolean
  /** Plain-English rule shown in the column picker (match columns only). */
  help: string | null
  /** What recorded data the column needs, for the coverage caption. */
  needs: 'balls' | 'bowling' | 'fow' | 'fielding' | null
  value: (c: LabCells, min: MatchMinimums) => number | null
  format: (c: LabCells, min: MatchMinimums) => string
}

const classic: LabColumn[] = METRICS.map((m) => ({
  key: m.key, label: m.label, short: m.short, group: m.group, matchOnly: false, higherIsBetter: m.higherIsBetter, help: null, needs: null,
  value: (c) => m.value(c.counts),
  format: (c) => m.format(c.counts),
}))

const fromMatch: LabColumn[] = MATCH_METRICS.map((m) => {
  const ok = (c: LabCells, min: MatchMinimums) => c.match !== null && matchQualifies(m.qualifier, c.match.counts, min)
  return {
    key: m.key, label: m.label, short: m.short, group: m.group, matchOnly: true, higherIsBetter: m.higherIsBetter, help: m.help,
    needs: m.needs,
    value: (c, min) => (ok(c, min) ? m.value(c.match!.counts) : null),
    format: (c, min) => (ok(c, min) ? m.format(c.match!.counts) : '–'),
  }
})

const num = (v: number | null) => (v === null ? '–' : String(v))

const partnershipColumns: LabColumn[] = [
  {
    key: 'bestPartnership', label: 'Best partnership', short: 'Best stand', group: 'batting', matchOnly: true, higherIsBetter: true, needs: 'fow',
    help: 'Highest stand the player took part in, inferred from batting order and fall of wickets. Only innings where it could be worked out count.',
    value: (c) => (c.match && c.match.partnerships.innings > 0 ? c.match.partnerships.best : null),
    format: (c) => num(c.match && c.match.partnerships.innings > 0 ? c.match.partnerships.best : null),
  },
  {
    key: 'partnerships50', label: 'Fifty partnerships', short: '50 stands', group: 'batting', matchOnly: true, higherIsBetter: true, needs: 'fow',
    help: 'Stands of 50 or more the player took part in, inferred from batting order and fall of wickets. Only innings where it could be worked out count.',
    value: (c) => (c.match && c.match.partnerships.innings > 0 ? c.match.partnerships.fifties : null),
    format: (c) => num(c.match && c.match.partnerships.innings > 0 ? c.match.partnerships.fifties : null),
  },
]

export const LAB_COLUMNS: readonly LabColumn[] = [...classic, ...fromMatch, ...partnershipColumns]
const BY_KEY = new Map(LAB_COLUMNS.map((c) => [c.key, c]))

export const LAB_COLUMN_KEYS: readonly string[] = LAB_COLUMNS.map((c) => c.key)
export const getLabColumn = (key: string): LabColumn | undefined => BY_KEY.get(key)
export const isMatchOnlyColumn = (key: string): boolean => BY_KEY.get(key)?.matchOnly === true

/** Columns of one discipline in picker order. */
export const labColumnsFor = (group: MetricGroup): LabColumn[] => LAB_COLUMNS.filter((c) => c.group === group)
export { GROUPS, GROUP_LABELS }
