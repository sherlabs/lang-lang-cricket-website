import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'

/** "Sat 17 Oct" in club time, for sentences and tables. Pure. */
export const gameDayLabel = (date: string): string => new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00Z`))
