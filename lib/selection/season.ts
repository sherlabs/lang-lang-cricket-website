import { CLUB_TIMEZONE, SEASON_START_MONTH } from '@/config/site'
import { seasonStartYearOf } from '@/lib/playhq/match-rows'

/** The calendar year a season that is running at `now` started in (a season starts in `SEASON_START_MONTH`, club time). */
export function currentSeasonStartYear(now: Date = new Date(), tz: string = CLUB_TIMEZONE, startMonth: number = SEASON_START_MONTH): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: 'numeric' }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  return month >= startMonth ? year : year - 1
}

/** The start year of a `player-seasons` row: the stored one on imported rows, else read from the PlayHQ season name. */
export const rowSeasonYear = (row: { seasonStartYear?: number | null; seasonName?: string | null }): number | null =>
  typeof row.seasonStartYear === 'number' ? row.seasonStartYear : row.seasonName ? seasonStartYearOf(row.seasonName) : null
