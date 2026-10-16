/**
 * Copy-ready post text and the date line for a team (announce-teams spec 5.4). Club name, sign-off and site URL are passed in from
 * config, never written here. A re-publish is prefixed "UPDATED: ".
 */
export type LineupPerson = { name: string; isCaptain: boolean; isKeeper: boolean }

export type LineupTextInput = {
  clubName: string
  gradeName: string
  opponent: string
  /** `YYYY-MM-DD` and `HH:mm[:ss]` in club time. */
  localDate: string
  localTime: string | null
  venue: string | null
  people: readonly LineupPerson[]
  /** False shows the XI alphabetically without numbers. */
  showOrder: boolean
  signOff: string
  /** Site origin without a trailing slash. */
  siteUrl: string
  updated: boolean
  locale: string
}

export const LINEUP_NAME_MAX = 40
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** `Sat 12 Oct`: the calendar date is formatted as UTC so the server's own timezone cannot move it. */
export function formatMatchDay(localDate: string, locale: string): string {
  const d = new Date(`${localDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return localDate
  const parts = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')}`
}

/** `Sat 12 Oct 2024`: the same UTC-safe date with the year, for views that list games from several seasons. */
export function formatMatchDayYear(localDate: string, locale: string): string {
  const d = new Date(`${localDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return localDate
  return `${formatMatchDay(localDate, locale)} ${new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' }).format(d)}`
}

/** `1:00pm` from `13:00:00`. Empty when there is no time. */
export function formatMatchTime(localTime: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(localTime ?? '')
  if (!m) return ''
  const h = Number(m[1])
  if (h > 23) return ''
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]}${h < 12 ? 'am' : 'pm'}`
}

export const personTag = (p: { isCaptain: boolean; isKeeper: boolean }): string => (p.isCaptain && p.isKeeper ? ' (c, wk)' : p.isCaptain ? ' (c)' : p.isKeeper ? ' (wk)' : '')

export function lineupText(i: LineupTextInput): string {
  const when = [formatMatchDay(i.localDate, i.locale), formatMatchTime(i.localTime), i.venue].filter(Boolean).join(', ')
  const head = `${i.updated ? 'UPDATED: ' : ''}${i.clubName ? `${i.clubName} ` : ''}${i.gradeName} v ${i.opponent}, ${when}`
  const people = i.showOrder ? i.people : [...i.people].sort((a, b) => a.name.localeCompare(b.name))
  const lines = people.map((p, n) => `${i.showOrder ? `${n + 1}. ` : '- '}${trunc(p.name, LINEUP_NAME_MAX)}${personTag(p)}`)
  const foot = [i.signOff.trim(), `${i.siteUrl.replace(/\/$/, '')}/teams`].filter(Boolean).join(' ')
  return [head, ...lines, foot].join('\n')
}
