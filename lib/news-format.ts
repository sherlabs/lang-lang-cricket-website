import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'

/** "4 October 2026" in the club's own locale and timezone (never the server's). */
export function formatNewsDate(d: Date): string {
  return new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, year: 'numeric', month: 'long', day: 'numeric' }).format(d)
}
