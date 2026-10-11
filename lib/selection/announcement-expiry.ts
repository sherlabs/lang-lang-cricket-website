import type { Payload } from 'payload'
import { clubToday } from '@/lib/selection-fixtures'
import { isTeamsAnnouncementKey } from './announce'

/**
 * Takes down the automatic "teams" announcements once their weekend is over, so "Matchday 10 October" does not stay on the site
 * for weeks. The weekend key is its Saturday; the banner stays through Sunday and goes from Monday. Run from the daily cron.
 * Only announcements the site made itself (hidden `autoKey` starting `teams:`) are touched.
 */
export async function expireTeamAnnouncements(payload: Payload, now: Date = new Date()): Promise<number> {
  const today = clubToday(now)
  const res = await payload.find({ collection: 'announcements', where: { and: [{ published: { equals: true } }, { autoKey: { like: 'teams:' } }] }, limit: 100, pagination: false, depth: 0, showHiddenFields: true, overrideAccess: true })
  let n = 0
  for (const a of res.docs as unknown as { id: number; autoKey?: string | null }[]) {
    if (!isTeamsAnnouncementKey(a.autoKey)) continue
    const saturday = a.autoKey.slice('teams:'.length)
    const lastDay = new Date(Date.parse(`${saturday}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saturday) || lastDay >= today) continue
    await payload.update({ collection: 'announcements', id: a.id, data: { published: false }, overrideAccess: true, context: { disableRevalidate: false } })
    n += 1
  }
  return n
}
