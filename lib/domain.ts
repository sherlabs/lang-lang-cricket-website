/**
 * Domain shapes the public components consume (spec §14). Hand-written (they were inferred
 * from Drizzle before); `lib/payload/mappers.ts` builds them from Payload docs. Image fields
 * are resolved to URL strings so presentational components are unchanged.
 * Domain types never carry secrets (tokens, private emails).
 *
 * WP2: content types. WP3: events. Stories and players move here in WP4–WP5.
 */

export type Sponsor = {
  id: number
  tier: string
  name: string
  /** '' when there is no logo (the name is shown as text). */
  logoUrl: string
  linkUrl: string
  sortOrder: number
}

export type Person = {
  id: number
  name: string
  role: string
  section: string
  phone: string
  email: string
  /** '' when there is no photo (initials are shown). */
  photoUrl: string
  sortOrder: number
}

export type GalleryPhoto = {
  id: number
  url: string
  caption: string
  sortOrder: number
  createdAt: Date
}

export type DocumentItem = {
  id: number
  title: string
  category: string
  url: string
}

export type Announcement = {
  id: number
  title: string
  body: string
  published: boolean
  createdAt: Date
  updatedAt: Date
}

export type EventType = 'one_time' | 'recurring'

/**
 * Dates are wall-clock-as-UTC (spec D12): `eventDate`/`startDate`/`endDate` are UTC midnight
 * of the club-timezone day; `eventTime` is `HH:mm` text ('' when unset).
 */
export type Event = {
  id: number
  type: EventType
  title: string
  description: string
  location: string
  /** '' when there is no cover (placeholder art is shown). */
  coverImageUrl: string
  paymentLinkLabel: string
  paymentLinkUrl: string
  /** Dinner choices offered on the RSVP form; [] = no meal step. */
  mealOptions: string[]
  eventTime: string
  /** one_time only. */
  eventDate: Date | null
  /** recurring only: 0 (Sun) – 6 (Sat). */
  dayOfWeek: number | null
  startDate: Date | null
  endDate: Date | null
  createdAt: Date
  updatedAt: Date
}

/** An RSVP as the token page sees it. No `editToken`: the page has it from the route param. */
export type EventRsvp = {
  id: number
  eventId: number
  /** Exact occurrence (wall-clock-as-UTC); cookie keys use its `toISOString()`. */
  occurrenceDate: Date
  name: string
  email: string
  note: string
  response: 'yes' | 'no'
  meal: string
  createdAt: Date
}

/** A public (approved) recap photo. */
export type EventPhoto = { url: string }
