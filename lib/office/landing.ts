import 'server-only'
import { diaryFigures } from '@/lib/diary-office-queries'
import { feeOwingSummary } from '@/lib/fees-office-queries'
import { memberCompleteness } from '@/lib/members-queries'
import { meetingStats } from '@/lib/meetings-office-queries'
import { stockFigures } from '@/lib/stock-office-queries'
import { nextGameDay } from '@/lib/volunteers-office-queries'
import { officeCopy } from '@/payload/admin/copy'
import { gameDayLabel } from './game-day'
import type { OfficeModuleKey } from './modules'

/**
 * One stat line per module for the landing page. Each is computed only for a caller allowed to see that module, and each sentence
 * says what it leaves out (`officeCopy`). A failed read drops the line, never the page.
 */
export async function landingStats(user: unknown, keys: readonly OfficeModuleKey[]): Promise<Partial<Record<OfficeModuleKey, string>>> {
  const out: Partial<Record<OfficeModuleKey, string>> = {}
  if (keys.includes('members')) {
    try {
      const c = await memberCompleteness(user)
      if (c) out.members = officeCopy.members.stat(c.total, c.noEmail)
    } catch (err) {
      console.warn('[office] members stat unavailable:', (err as Error).message)
    }
  }
  if (keys.includes('volunteers')) {
    const g = await nextGameDay(user)
    out.volunteers = g ? officeCopy.volunteers.stat(gameDayLabel(g.date), g.empty, g.slots) : officeCopy.volunteers.stat(null, 0, 0)
  }
  if (keys.includes('meetings')) {
    const m = await meetingStats(user)
    if (m) out.meetings = officeCopy.meetings.stat(m.next ? m.next.when : null, m.overdue)
  }
  if (keys.includes('diary')) {
    const d = await diaryFigures(user)
    if (d) out.diary = officeCopy.diary.stat(d.overdue, d.blocked, d.unowned)
  }
  if (keys.includes('stock')) {
    const st = await stockFigures(user)
    if (st) out.stock = officeCopy.stock.stat(st.low, st.out, st.overdue)
  }
  if (keys.includes('fees')) {
    const f = await feeOwingSummary(user)
    if (f) out.fees = officeCopy.fees.stat(f.members, f.money)
  }
  return out
}
