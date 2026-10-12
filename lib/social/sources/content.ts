import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { listUpcomingItems } from '@/lib/events-queries'
import { toSponsor } from '@/lib/payload/mappers'
import { TIER_ORDER } from '@/lib/sponsors'
import { isDrawableImageType } from '@/lib/stats/card'
import { loadImageDataUri } from '@/lib/theme/og'
import type { EventPromoData, EventPromoParams } from '../specs/event-promo'
import type { SponsorThanksData, SponsorThanksParams } from '../specs/sponsor-thanks'
import type { SourceList } from '../types'
import { dayLabel, timeLabel } from './shared'

export async function eventChoices(): Promise<SourceList> {
  const items = await listUpcomingItems()
  return { choices: items.slice(0, 12).map((i) => ({ id: String(i.event.id), label: `${i.event.title}, ${dayLabel(i.occurrenceDate.toISOString().slice(0, 10))}` })), empty: 'No upcoming events.' }
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

async function publicSponsors() {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({ collection: 'sponsors', pagination: false, depth: 1, sort: 'sortOrder', overrideAccess: true })
  return docs.sort((a, b) => TIER_ORDER.indexOf(a.tier as (typeof TIER_ORDER)[number]) - TIER_ORDER.indexOf(b.tier as (typeof TIER_ORDER)[number]) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

export async function sponsorChoices(): Promise<SourceList> {
  const docs = await publicSponsors()
  // A logo that is missing or is not a PNG or JPG cannot be drawn; the picture then shows the name, and the composer says so.
  const drawable = (d: (typeof docs)[number]): boolean => typeof d.logo === 'object' && d.logo !== null && isDrawableImageType(d.logo.mimeType)
  return {
    multi: true,
    choices: docs.map((d) => ({ id: String(d.id), label: `${d.name} (${d.tier})`, ...(drawable(d) ? {} : { note: `${d.name} has no logo we can draw, so the name is shown.` }) })),
    empty: 'No sponsors have been added yet.',
  }
}

export async function loadSponsors(p: SponsorThanksParams): Promise<SponsorThanksData | null> {
  const docs = (await publicSponsors()).filter((d) => p.ids.includes(d.id))
  if (!docs.length) return null
  const sponsors = await Promise.all(
    docs.map(async (d) => {
      const s = toSponsor(d)
      const logo = typeof d.logo === 'object' && d.logo ? await loadImageDataUri(s.logoUrl, d.logo.updatedAt) : null
      return { name: s.name, tier: s.tier, logo }
    }),
  )
  return { sponsors, line: p.text }
}
