/**
 * Domain shapes the public components consume (spec §14). Hand-written (they were inferred
 * from Drizzle before); `lib/payload/mappers.ts` builds them from Payload docs. Image fields
 * are resolved to URL strings so presentational components are unchanged.
 * Domain types never carry secrets (tokens, private emails).
 *
 * WP2: content types. Events, stories and players move here in WP3–WP5.
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
