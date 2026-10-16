import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { isStaffUser } from '@/payload/access'
import { resolveOfficeSettings, type OfficeSettings } from './settings'

/**
 * The non-sensitive office settings for a staff caller (editors cannot read the global over REST, so this is the only door).
 * Never throws: a failed read gives the defaults.
 */
export async function getOfficeSettings(user: unknown): Promise<OfficeSettings> {
  if (!isStaffUser(user as never)) return resolveOfficeSettings(null)
  try {
    const payload = await getPayloadClient()
    return resolveOfficeSettings(await payload.findGlobal({ slug: 'office-settings', depth: 0, overrideAccess: true }))
  } catch (err) {
    console.warn('[office] settings unavailable, using defaults:', (err as Error).message)
    return resolveOfficeSettings(null)
  }
}
