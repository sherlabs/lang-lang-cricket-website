import type { CollectionSlug, Where } from 'payload'
import { nowAsEventClock } from '../../lib/event-occurrences'

/**
 * Dashboard count cards (spec §9). Each WP appends the cards for its own collections;
 * no card may reference a collection that is not registered yet.
 * WP2: documents, gallery photos, sponsors, people. WP3: upcoming events, pending event photos.
 * WP4: published stories, pending stories. WP5: players.
 */
export type DashboardCard = {
  collection: CollectionSlug
  label: string
  note: string
  /** Narrows the count; a function is evaluated per request (e.g. anything relative to "now"). */
  where?: Where | (() => Where)
  /** The matching list filter as a query string, e.g. `where[status][equals]=pending`. */
  listQuery?: string
}

export const dashboardCards: DashboardCard[] = [
  { collection: 'documents', label: 'Documents', note: 'PDFs on the Documents page' },
  { collection: 'gallery-photos', label: 'Photos', note: 'First six show on the homepage' },
  { collection: 'sponsors', label: 'Sponsors', note: 'Logos by tier' },
  { collection: 'people', label: 'People', note: 'Committee, leadership and coaches' },
]

/** Today's date as the events store it: UTC midnight of the club-timezone day (wall-clock-as-UTC). */
function eventToday(): string {
  const now = nowAsEventClock()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

dashboardCards.push(
  {
    collection: 'events',
    label: 'Upcoming events',
    note: 'One-time events dated today or later (including any that started earlier today), and recurring series still running',
    where: (): Where => ({
      or: [
        { and: [{ type: { equals: 'one_time' } }, { eventDate: { greater_than_equal: eventToday() } }] },
        { and: [{ type: { equals: 'recurring' } }, { endDate: { greater_than_equal: eventToday() } }] },
      ],
    }),
  },
  {
    collection: 'event-photos',
    label: 'Pending event photos',
    note: 'Sent in from event pages, awaiting review',
    where: { status: { equals: 'pending' } },
    listQuery: 'where[status][equals]=pending',
  },
)

dashboardCards.push(
  {
    collection: 'stories',
    label: 'Published stories',
    note: 'Live on the history page',
    where: { status: { equals: 'published' } },
    listQuery: 'where[status][equals]=published',
  },
  {
    collection: 'stories',
    label: 'Pending stories',
    note: 'Sent in from the history page, awaiting review',
    where: { status: { equals: 'pending' } },
    listQuery: 'where[status][equals]=pending',
  },
)

dashboardCards.push({
  collection: 'players',
  label: 'Players',
  note: 'Synced from PlayHQ every night, plus past players added here',
})
