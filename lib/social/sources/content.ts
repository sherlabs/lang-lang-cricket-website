import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { listUpcomingItems } from '@/lib/events-queries'
import { toSponsor } from '@/lib/payload/mappers'
import { TIER_ORDER } from '@/lib/sponsors'
import { loadImageDataUri } from '@/lib/theme/og'
import type { EventPromoData, EventPromoParams } from '../specs/event-promo'
import type { SponsorThanksData, SponsorThanksParams } from '../specs/sponsor-thanks'
import type { SourceList } from '../types'
import { logoReason, sponsorLogo } from './logos'
import { dayLabel, timeLabel } from './shared'

export async function eventChoices(): Promise<SourceList> {
  const items = await listUpcomingItems()
  return { version: 2, choices: items.slice(0, 12).map((i) => ({ id: String(i.event.id), label: `${i.event.title}, ${dayLabel(i.occurrenceDate.toISOString().slice(0, 10))}`, row: { kind: 'event' as const, title: i.event.title, date: i.occurrenceDate.toISOString().slice(0, 10) } })), empty: 'No upcoming events.' }
}

export async function loadEvent(p: EventPromoParams): Promise<EventPromoData | null> {
  // Only an upcoming event (the same list the public events page uses) can be drawn.
  const item = (await listUpcomingItems()).find((i) => i.event.id === p.eventId)
  if (!item) return null
  const e = item.event
  return {
    title: e.title,
    dateLabel: dayLabel(item.occurrenceDate.toISOString().slice(0, 10)),
    timeLabel: /^\d{1,2}:\d{2}/.test(e.eventTime) ? timeLabel(e.eventTime) : e.eventTime,
    place: e.location,
    cover: e.coverImageUrl ? await loadImageDataUri(e.coverImageUrl, e.updatedAt) : null,
  }
}

export async function publicSponsors() {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({ collection: 'sponsors', pagination: false, depth: 1, sort: 'sortOrder', overrideAccess: true })
  return docs.sort((a, b) => TIER_ORDER.indexOf(a.tier as (typeof TIER_ORDER)[number]) - TIER_ORDER.indexOf(b.tier as (typeof TIER_ORDER)[number]) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

export async function sponsorChoices(): Promise<SourceList> {
  const payload = await getPayloadClient()
  const docs = await publicSponsors()
  // The logo is read from the stored upload and decoded by `loadLogoDataUri` (any of PNG, JPEG, WebP, GIF, AVIF or a safe SVG). A sponsor
  // with no logo, or one that still cannot be drawn, is shown by name, and the row says which of the two it is.
  const logos = await Promise.all(docs.map((d) => sponsorLogo(payload, d.logo)))
  return {
    version: 2,
    multi: true,
    choices: docs.map((d, i) => {
      const r = logos[i]
      const logo: 'ok' | 'none' | 'failed' = 'dataUri' in r ? 'ok' : r.error === 'none' ? 'none' : 'failed'
      return {
        id: String(d.id),
        label: `${d.name} (${d.tier})`,
        ...(logo === 'failed' ? { note: `${d.name}: ${logoReason(r)}, so the name is shown.` } : {}),
        row: { kind: 'sponsor' as const, name: d.name, tier: d.tier, logo, ...(logo === 'ok' ? { logoUrl: `/api/admin/social/logo/${d.id}` } : {}) },
      }
    }),
    empty: 'No sponsors have been added yet.',
  }
}

export async function loadSponsors(p: SponsorThanksParams): Promise<SponsorThanksData | null> {
  const payload = await getPayloadClient()
  const docs = (await publicSponsors()).filter((d) => p.ids.includes(d.id))
  if (!docs.length) return null
  const sponsors = await Promise.all(
    docs.map(async (d) => {
      const s = toSponsor(d)
      const r = await sponsorLogo(payload, d.logo)
      return { name: s.name, tier: s.tier, logo: 'dataUri' in r ? r.dataUri : null }
    }),
  )
  return { sponsors, line: p.text }
}
