import { formatMatchDay, formatMatchTime } from './lineup-text'

/**
 * The site announcement a publish creates or updates (announce-teams spec 5.4 item 2): one per weekend, found by a hidden
 * `autoKey`. Copy comes from config (the matchday label), never from here.
 */
export const announcementKey = (weekendKey: string): string => `teams:${weekendKey}`
export const isTeamsAnnouncementKey = (k: unknown): k is string => typeof k === 'string' && k.startsWith('teams:')

export type AnnounceSheet = { gradeName: string; opponent: string; localDate: string; localTime: string | null }

export function announcementTitle(i: { label: string; firstLocalDate: string; locale: string; updated: boolean }): string {
  const d = new Date(`${i.firstLocalDate}T00:00:00Z`)
  const day = Number.isNaN(d.getTime()) ? i.firstLocalDate : new Intl.DateTimeFormat(i.locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d)
  return `${i.label} ${day}${i.updated ? ' (updated)' : ''}`
}

/**
 * A plain list: one line per grade with the opponent and time, then the grades that changed on an update. It never names a
 * player: the announcement is stored text that nothing re-checks, so a player hidden after publishing (spec 5.4) must not be in it.
 * The XI lives on the `/teams` page, which does withhold hidden players.
 */
export function announcementBody(sheets: readonly AnnounceSheet[], locale: string, updatedGrades: readonly string[] = []): string {
  const blocks = sheets.map((s) => {
    const when = [formatMatchDay(s.localDate, locale), formatMatchTime(s.localTime)].filter(Boolean).join(' ')
    return `${s.gradeName} v ${s.opponent} (${when})`
  })
  const tail = updatedGrades.length ? [`Updated: ${updatedGrades.join(', ')}.`] : []
  return [...blocks, ...tail].join('\n')
}
