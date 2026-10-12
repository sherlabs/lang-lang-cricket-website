import 'server-only'
import { memberCompleteness } from '@/lib/members-queries'
import { officeCopy } from '@/payload/admin/copy'
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
  return out
}
