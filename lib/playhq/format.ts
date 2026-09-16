export const PLAYHQ_CLUB_URL = 'https://www.playhq.com/cricket-australia/org/lang-lang-cricket-club/484ced51'

type DateOpts = { weekday?: boolean }

/** Assemble `Sat 25 Oct 2025` from parts so ICU comma differences can't leak in. */
function assemble(d: Date, timeZone: string, weekday: boolean) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone,
  }).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  const core = `${get('day')} ${get('month')} ${get('year')}`
  return weekday ? `${get('weekday')} ${core}` : core
}

function localToDate(localDate: string) {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

/** `YYYY-MM-DD` (already local) → `Sat 25 Oct 2025`. */
export function formatLocalDate(localDate: string, opts: DateOpts = {}): string {
  return assemble(localToDate(localDate), 'UTC', opts.weekday ?? true)
}

/** `HH:mm:ss` → `1:00 pm`; null passes through. */
export function formatLocalTime(localTime: string | null): string | null {
  if (!localTime) return null
  const [hh, mm] = localTime.split(':')
  const h = Number(hh)
  if (Number.isNaN(h)) return null
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mm ?? '00'} ${suffix}`
}

export function dateParts(localDate: string): { day: string; month: string } {
  const d = localToDate(localDate)
  const parts = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  return { day: get('day'), month: get('month') }
}

/** ISO instant → full date in Melbourne time. */
export function formatIsoMelbourne(iso: string): string {
  return assemble(new Date(iso), 'Australia/Melbourne', true)
}

export function seasonHref(base: string, season: string | null, team?: string | null): string {
  const q: string[] = []
  if (season) q.push(`season=${encodeURIComponent(season)}`)
  if (team) q.push(`team=${encodeURIComponent(team)}`)
  return q.length ? `${base}?${q.join('&')}` : base
}
