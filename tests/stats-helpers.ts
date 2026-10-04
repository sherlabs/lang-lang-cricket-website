import { EMPTY_COUNTS, type SeasonCounts } from '@/lib/players/season-math'
import type { StatRow } from '@/lib/stats/aggregate'

export const counts = (o: Partial<SeasonCounts> = {}): SeasonCounts => ({ ...EMPTY_COUNTS, ...o })

export function row(o: Partial<Omit<StatRow, 'counts'>> & { counts?: Partial<SeasonCounts> } = {}): StatRow {
  return {
    playerId: 1, seasonName: 'Summer 2025/26', seasonOrder: 0, teamId: 't1', teamName: 'Lang Lang A Grade', gradeName: 'A Grade',
    ...o, counts: counts(o.counts),
  }
}
