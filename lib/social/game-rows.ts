import type { PickerRow } from './types'

/** The pure builder for the picker's game rows (wave G spec WP-2a): date, grade and round, opposition, a result badge and the score line. */
export type GameRowInput = {
  /** `YYYY-MM-DD` or empty. */
  date: string | null | undefined
  /** The grade label as the public sees it (see `displayGrade`). */
  grade: string
  round?: string | null
  opposition: string
  /** `W`, `L`, `T`, `D`, `N` (no result) or anything else for "no badge". */
  letter?: string
  clubName?: string
  clubScore?: string
  oppScore?: string
  upcoming?: boolean
}

const BADGES: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  W: { label: 'Won', tone: 'ok' },
  L: { label: 'Lost', tone: 'danger' },
  T: { label: 'Tied', tone: 'neutral' },
  D: { label: 'Draw', tone: 'neutral' },
  N: { label: 'No result', tone: 'warn' },
}

const isoDate = (d: string | null | undefined): string => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '')

/** "October 2025" for a date, in the club's language. Dates are plain calendar days, so no time zone applies. */
export function monthLabel(date: string, locale: string): string {
  const d = isoDate(date)
  return d ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)) : 'No date'
}

export function gameRow(i: GameRowInput, locale: string): Extract<PickerRow, { kind: 'game' }> {
  const date = isoDate(i.date)
  const round = (i.round ?? '').trim()
  const grade = i.grade.trim()
  const badge = i.letter ? BADGES[i.letter] : undefined
  const clubScore = (i.clubScore ?? '').trim()
  const oppScore = (i.oppScore ?? '').trim()
  const club = (i.clubName ?? '').trim()
  const score = clubScore && oppScore ? `${club ? `${club} ` : ''}${clubScore} v ${i.opposition} ${oppScore}` : undefined
  return {
    kind: 'game',
    date,
    title: [grade, round].filter(Boolean).join(', ') || 'Game',
    subtitle: `v ${i.opposition}`,
    ...(badge ? { result: badge } : {}),
    ...(score ? { score } : {}),
    group: round || monthLabel(date, locale),
    ...(i.upcoming ? { upcoming: true } : {}),
  }
}

/** The text the picker searches: opposition, grade, round, the date as digits and as words, and the result. */
export function searchTextOf(row: PickerRow, label: string, locale: string): string {
  if (row.kind === 'game') {
    const words = row.date ? new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${row.date}T00:00:00Z`)) : ''
    return [label, row.title, row.subtitle, row.date, words, row.result?.label ?? '', row.score ?? ''].join(' ').toLowerCase()
  }
  if (row.kind === 'sponsor') return `${row.name} ${row.tier}`.toLowerCase()
  return `${row.title} ${row.date} ${label}`.toLowerCase()
}
