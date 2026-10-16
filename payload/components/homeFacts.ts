import { CLUB_TIMEZONE } from '@/config/site'
import { attentionItems, type AttentionItem } from '@/lib/admin/attention'
import type { NotificationInput } from '@/lib/admin/notifications'
import { getClub } from '@/lib/club'
import type { Payload } from 'payload'
import { loadNotificationFacts } from './NotificationCentre'

export type HomeFacts = { input: NotificationInput | null; items: AttentionItem[] }

/**
 * Loaded once per Home visit and shared by the greeting, the attention list and (for administrators) System health. A failure leaves
 * the section out rather than breaking the page.
 */
export async function loadHomeFacts(payload: Payload, isAdmin: boolean, user?: unknown): Promise<HomeFacts> {
  try {
    const [{ input, game }, club] = await Promise.all([loadNotificationFacts(payload, isAdmin, user), getClub()])
    const items = attentionItems(input, {
      isAdmin, adminRoute: payload.config.routes.admin, clock: { timeZone: CLUB_TIMEZONE, locale: club.locale }, now: new Date(),
      volunteers: game ? { empty: game.empty, date: game.date, daysAway: game.daysAway } : null,
    })
    return { input, items }
  } catch (err) {
    console.warn('[admin] Home notices unavailable:', (err as Error).message)
    return { input: null, items: [] }
  }
}
