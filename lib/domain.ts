/**
 * Domain shapes the public components consume (spec §14). Hand-written (they were inferred
 * from Drizzle before); `lib/payload/mappers.ts` builds them from Payload docs. Image fields
 * are resolved to URL strings so presentational components are unchanged.
 * Domain types never carry secrets (tokens, private emails).
 *
 * WP2: content types. WP3: events. WP4: stories. Players move here in WP5.
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

/** Serialized Lexical state of a story body (`stories.content`, spec §5). */
export type StoryContent = {
  root: { type: string; children: unknown[]; [k: string]: unknown }
  [k: string]: unknown
}

export type StoryStatus = 'pending' | 'published' | 'rejected'

/**
 * A story as the public pages see it. Never carries `editToken`, `viewToken` or `authorEmail`
 * (spec §2): token pages get the one token they need from the route param.
 */
export type Story = {
  id: number
  slug: string
  title: string
  excerpt: string
  /** Lexical, with upload nodes populated (fetched at depth 1). */
  content: StoryContent | null
  /** '' when there is no cover. */
  coverImageUrl: string
  authorName: string
  status: StoryStatus
  submittedByAdmin: boolean
  publishedAt: Date | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
