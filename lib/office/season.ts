import { SEASON_NAME_FORMAT, SEASON_START_MONTH } from '@/config/site'
import { seasonOfDate } from '@/lib/history-import/match-rows'

/**
 * Seasons for the club office, a thin wrapper over the club's season rules in `config/site.ts` (start month and name format), so
 * nothing here knows a hemisphere. A season is named like the rest of the site ("2026/27" or "2026"). Pure.
 */
type Cfg = { startMonth: number; format: 'split' | 'single' }
const DEFAULT_CFG: Cfg = { startMonth: SEASON_START_MONTH, format: SEASON_NAME_FORMAT }

export const seasonNameForYear = (startYear: number, cfg: Cfg = DEFAULT_CFG): string =>
  cfg.format === 'single' ? String(startYear) : `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`

/** The season a date (YYYY-MM-DD) falls in. */
export const seasonOfClubDate = (date: string, cfg: Cfg = DEFAULT_CFG): { startYear: number; name: string } => seasonOfDate(date, cfg)

/** The season running on `today` (YYYY-MM-DD, club time). */
export const currentSeason = (today: string, cfg: Cfg = DEFAULT_CFG): { startYear: number; name: string } => seasonOfClubDate(today, cfg)

/** Start year of a season name, or null if it is not one ("2026/27" and "2026" both give 2026). */
export function seasonStartYearOfName(name: string, cfg: Cfg = DEFAULT_CFG): number | null {
  const t = name.trim()
  if (cfg.format === 'single') return /^\d{4}$/.test(t) ? Number(t) : null
  const m = /^(\d{4})\/(\d{2})$/.exec(t)
  // The end year must be the start year plus one ("2026/27"), so a typo cannot open a separate ledger bucket.
  return m && Number(m[2]) === (Number(m[1]) + 1) % 100 ? Number(m[1]) : null
}

/** First and last day (YYYY-MM-DD) of a season, or null for a name that is not a season. */
export function seasonRange(name: string, cfg: Cfg = DEFAULT_CFG): { from: string; to: string; startYear: number } | null {
  const y = seasonStartYearOfName(name, cfg)
  if (y === null) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${y}-${pad(cfg.startMonth)}-01`
  // The season ends the day before the next one starts: the last day of the month before the start month.
  const endYear = cfg.startMonth === 1 ? y : y + 1
  const endMonth = cfg.startMonth === 1 ? 12 : cfg.startMonth - 1
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate()
  return { from, to: `${endYear}-${pad(endMonth)}-${pad(lastDay)}`, startYear: y }
}

/** The seasons from `fromYear` to the current one, newest first, for pickers. */
export function seasonChoices(today: string, count = 6, cfg: Cfg = DEFAULT_CFG): string[] {
  const cur = currentSeason(today, cfg).startYear
  return Array.from({ length: count }, (_, i) => seasonNameForYear(cur - i, cfg))
}

export const isSeasonName = (v: unknown, cfg: Cfg = DEFAULT_CFG): v is string => typeof v === 'string' && seasonStartYearOfName(v, cfg) !== null
