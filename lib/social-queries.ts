import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { resolveSocialSettings, type SocialSettings } from '@/lib/social/settings'
import { TIER_ORDER } from '@/lib/sponsors'
import { loadImageDataUri } from '@/lib/theme/og'

/** The social-settings global with every gap filled (never throws: a graphic must still render if the read fails). */
export async function getSocialSettings(): Promise<SocialSettings> {
  try {
    const payload = await getPayloadClient()
    const doc = await payload.findGlobal({ slug: 'social-settings', depth: 0, overrideAccess: true })
    return resolveSocialSettings(doc)
  } catch (err) {
    console.warn('[social] settings unavailable, using defaults:', (err as Error).message)
    return resolveSocialSettings(null)
  }
}

/**
 * Sponsor logos for the footer strip: the tiers in the settings, in tier then sort order, up to `max`. A logo that is not a
 * PNG or JPG, or that cannot be fetched in time, is skipped; with none left the strip is simply absent.
 */
export async function sponsorsForStrip(settings: SocialSettings): Promise<{ src: string; name: string }[]> {
  if (!settings.sponsorStrip.show || settings.sponsorStrip.tiers.length === 0) return []
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'sponsors',
    where: { tier: { in: settings.sponsorStrip.tiers } },
    pagination: false,
    depth: 1,
    overrideAccess: true,
  })
  const ordered = docs
    .filter((d) => typeof d.logo === 'object' && d.logo !== null && Boolean(d.logo.url))
    .sort((a, b) => TIER_ORDER.indexOf(a.tier as (typeof TIER_ORDER)[number]) - TIER_ORDER.indexOf(b.tier as (typeof TIER_ORDER)[number]) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
    .slice(0, settings.sponsorStrip.max)
  const loaded = await Promise.all(
    ordered.map(async (d) => {
      const logo = d.logo as { url?: string | null; updatedAt?: string }
      const src = await loadImageDataUri(logo.url ?? '', logo.updatedAt ?? '')
      return src ? { src, name: d.name } : null
    }),
  )
  return loaded.filter((x): x is { src: string; name: string } => x !== null)
}

/** True when the strip is switched on and has logos configured but none could be drawn (the composer hints at PNG or JPG). */
export const stripHint = 'Sponsor logos need to be PNG or JPG to appear on pictures.'
