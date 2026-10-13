import { CLUB_LOCALE } from '@/config/site'

/** "12 Oct" for a chart label; an unknown date reads "no date". Uses the club locale from config. */
export function shortDate(iso: string | null, locale: string = CLUB_LOCALE): string {
  if (!iso) return 'no date'
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}

/** Chart labels for a run of dates: "12 Oct", and "12 Oct 24" for every label once the dates span more than one year. */
export function shortDates(isos: readonly (string | null)[], locale: string = CLUB_LOCALE): string[] {
  const years = new Set(isos.flatMap((d) => (d && /^\d{4}/.test(d) ? [d.slice(0, 4)] : [])))
  if (years.size < 2) return isos.map((d) => shortDate(d, locale))
  return isos.map((d) => {
    if (!d) return 'no date'
    const t = new Date(`${d}T00:00:00Z`)
    return Number.isNaN(t.getTime()) ? d : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(t)
  })
}
