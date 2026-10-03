import type { CollectionSlug, Where } from 'payload'

/**
 * Dashboard count cards (spec §9). Each WP appends the cards for its own collections;
 * no card may reference a collection that is not registered yet.
 * WP2: documents, gallery photos, sponsors, people.
 */
export type DashboardCard = {
  collection: CollectionSlug
  label: string
  note: string
  /** Narrows the count. */
  where?: Where
  /** The matching list filter as a query string, e.g. `where[status][equals]=pending`. */
  listQuery?: string
}

export const dashboardCards: DashboardCard[] = [
  { collection: 'documents', label: 'Documents', note: 'PDFs on the Documents page' },
  { collection: 'gallery-photos', label: 'Photos', note: 'First six show on the homepage' },
  { collection: 'sponsors', label: 'Sponsors', note: 'Logos by tier' },
  { collection: 'people', label: 'People', note: 'Committee, leadership and coaches' },
]
