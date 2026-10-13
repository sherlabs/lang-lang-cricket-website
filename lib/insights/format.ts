import { CLUB_LOCALE } from '@/config/site'

/** "12 Oct" for a chart label; an unknown date reads "no date". Uses the club locale from config. */
export function shortDate(iso: string | null, locale: string = CLUB_LOCALE): string {
  if (!iso) return 'no date'
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}
