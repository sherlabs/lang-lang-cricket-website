import { formatMatchDay, formatMatchTime } from './lineup-text'

/**
 * The site announcement a publish creates or updates (announce-teams spec 5.4 item 2): one per weekend, found by a hidden
 * `autoKey`. Copy comes from config (the matchday label), never from here.
 */
export const announcementKey = (weekendKey: string): string => `teams:${weekendKey}`
export const isTeamsAnnouncementKey = (k: unknown): k is string => typeof k === 'string' && k.startsWith('teams:')

export type AnnounceSheet = { gradeName: string; opponent: string; localDate: string; localTime: string | null; xi: readonly string[] }

export function announcementTitle(i: { label: string; firstLocalDate: string; locale: string; updated: boolean }): string {
  const d = new Date(`${i.firstLocalDate}T00:00:00Z`)
  const day = Number.isNaN(d.getTime()) ? i.firstLocalDate : new Intl.DateTimeFormat(i.locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d)
  return `${i.label} ${day}${i.updated ? ' (updated)' : ''}`
}

/** A plain list: one block per grade, a line for the game and a one-line XI; then the change list on an update. */
export function announcementBody(sheets: readonly AnnounceSheet[], locale: string, changes: readonly string[] = []): string {
  const blocks = sheets.map((s) => {
    const when = [formatMatchDay(s.localDate, locale), formatMatchTime(s.localTime)].filter(Boolean).join(' ')
    return `${s.gradeName} v ${s.opponent} (${when})\n${s.xi.join(', ')}`
  })
  const tail = changes.length ? [`Changes: ${changes.join('; ')}.`] : []
  return [...blocks, ...tail].join('\n\n')
}
