# Events feature — design spec

Date: 2026-09-24

## Purpose

Add an events page: one-time club events (working bees, presentation nights,
fundraisers) and recurring events (e.g. "Thursday training, 6pm, every week
until March"). Visitors can RSVP with just a name — no login — and get back
a private link to change or cancel their RSVP later. Admin manages events
from the admin panel, including bulk-uploading recap photos to a one-time
event once it's happened.

Success = `/events` shows upcoming events (one-time + the next several
occurrences of each recurring event) and past one-time events with their
recap photos; anyone can RSVP to a specific date; `/admin/events` lets the
club create/edit events, see who's RSVP'd, and upload recap photos.

## Out of scope

- Facebook/Google login, or any real authentication for RSVPs. Ownership is
  a secret edit link, exactly like the story draft-edit links already built
  — not a substitute for real auth, just enough to let someone change their
  own RSVP without an account.
- Emailing the edit link, or any "resend my link" flow. If it's lost, no
  self-serve recovery — the admin can find and edit/cancel any RSVP from
  the admin panel. This can be added later if it turns out people lose
  links often; not built speculatively now.
- Structured meal-choice selection (e.g. "Chicken / Vegetarian / None" as
  discrete options). RSVPs get a single free-text note field instead
  (e.g. "bringing 2 kids, one vegetarian"). The payment link is what
  actually handles food/ticket payment; the note is just context for the
  club.
- Recurring events as a general calendar/recurrence engine (arbitrary
  RRULE-style patterns, multiple times per week, exceptions/skipped dates,
  etc.). A recurring event is exactly: one day of the week, one time of
  day, a start date, and an end date. That covers "every Thursday at 6pm
  from October to March," which is the actual use case.
- Editing or deleting recap photos individually with captions beyond what
  the existing gallery-photo admin pattern already supports (caption +
  sort order) — reuse that pattern as-is, no new photo-management UI
  concepts.

## Data model

Three new tables in `db/schema.ts`, following this codebase's existing
style (serial `id`, plain `pgTable`, no relations layer, `text('...')`
columns default to `''` rather than being nullable where a column applies
to both event types but is simply unused for one of them):

```ts
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // 'one_time' | 'recurring'
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  location: text('location').notNull().default(''),
  coverImageUrl: text('cover_image_url').notNull().default(''),
  paymentLinkLabel: text('payment_link_label').notNull().default(''),
  paymentLinkUrl: text('payment_link_url').notNull().default(''),
  // one_time only:
  eventDate: timestamp('event_date'),
  // recurring only:
  dayOfWeek: integer('day_of_week'), // 0 (Sunday) - 6 (Saturday)
  eventTime: text('event_time').notNull().default(''), // "18:00", 24h, display-formatted at render time
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const eventRsvps = pgTable('event_rsvps', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  // For a one_time event this always equals that event's eventDate (as a
  // date, time stripped). For a recurring event this is whichever
  // occurrence the person picked. Not a foreign key to anything — recurring
  // occurrences aren't materialized as their own rows anywhere else, so an
  // occurrence's only identity is (eventId, occurrenceDate).
  occurrenceDate: timestamp('occurrence_date').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  note: text('note').notNull().default(''),
  editToken: text('edit_token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const eventPhotos = pgTable('event_photos', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  url: text('url').notNull(),
  caption: text('caption').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

No foreign-key constraints are declared — this matches every existing
table in this schema (none of them use Drizzle's `.references()` either).
Deleting an event does not need to cascade-delete its RSVPs/photos for a
first version; orphaned rows from a deleted event are an acceptable
edge case at this site's scale (the same way deleting a gallery photo or
sponsor doesn't need cascade logic today).

## Occurrence model

A "occurrence" is the (event, date) pair someone can RSVP to:

- **One-time event**: exactly one occurrence, `eventDate` itself.
- **Recurring event**: every date matching `dayOfWeek` between `startDate`
  and `endDate` inclusive. These are **computed on the fly**, never
  materialized as their own database rows — a pure function
  `getOccurrences(event, { from, to })` in `lib/event-occurrences.ts`
  returns the list of `Date`s in a range, **with `eventTime` already
  merged in** (e.g. a Thursday date combined with `"18:00"` produces a
  `Date` at 18:00 that day) — every occurrence `Date` this function
  produces is a full timestamp, never a bare midnight-of-day value, so
  sorting/display/comparison-to-now all work uniformly whether the
  event is one-time or recurring. RSVPs reference an occurrence purely
  by `(eventId, occurrenceDate)`; the occurrence itself has no
  independent row until someone RSVPs to it, at which point an
  `eventRsvps` row exists for that pair. This avoids ever needing to
  backfill/generate rows for a recurring series when it's created or
  when its end date is extended.

"Upcoming" on the public page shows: every future one-time event, plus
the next 6 occurrences of every currently-active recurring event
(`startDate <= today <= endDate`). "Past" shows one-time events whose
`eventDate` has passed, each with its recap photos if any exist yet.
Recurring events never appear in "Past" — once `endDate` passes, the
series simply stops appearing in "Upcoming" and produces no more
occurrences; a recurring series has no per-occurrence recap-photo concept
(only one-time events get bulk photo uploads, per the feature ask).

## RSVP flow (public, no login)

1. On an occurrence's "RSVP" button, a small form: name (required), email
   (optional), note (optional free text).
2. Submitting generates an `editToken` (same `generateStoryToken()`-style
   `crypto.randomUUID()` helper already in `lib/story-tokens.ts` — reused
   directly, not reimplemented, since it's already exactly "generate an
   unguessable secret"), inserts the `eventRsvps` row, and shows the edit
   link once (copy button, plus a cookie so the same browser can find its
   way back — identical UX to the story draft links' `DraftLinks`
   component and cookie pattern).
3. `/events/rsvp/[token]` — no login: shows the RSVP with editable
   name/email/note and a "Cancel my RSVP" (delete) option. Works regardless
   of whether the event/occurrence is in the past (so someone can still see
   or correct what they submitted), though the public event page only
   offers new RSVPs for future occurrences.
4. Losing the link means no self-serve recovery (see "Out of scope") — the
   admin can find and edit/delete any RSVP from `/admin/events`.

## Admin (`/admin/events`)

Follows the existing admin section pattern (`page.tsx` + `actions.ts`,
`AdminPageHeader`, `AdminCard`, `ActionForm`/`ConfirmDelete`, admin-session
check on every server action — matching the stories admin actions'
`requireAdmin()` guard, not the older sections that skip it):

- **Create/edit event** form: title, description, location, cover image
  (same crop-free single-image upload pattern as sponsor logos — no crop
  step needed here since it's a rectangular event photo, not a circular
  avatar), payment link label + URL (both optional, shown/hidden together),
  and a **type** selector that swaps the date fields shown:
  - One-time: a single date/time picker (`eventDate`).
  - Recurring: day-of-week select, time-of-day input, start date, end
    date.
- **Event list**: shows all events, type badge, date summary (formatted
  per type — "Sat 15 Nov, 2pm" vs "Every Thursday, 6pm · until 30 Mar"),
  RSVP count, edit/delete.
- **RSVPs view**: per event, a list of RSVPs (name, email, note,
  occurrence date), grouped by occurrence date for recurring events. Admin
  can delete any RSVP (e.g. on behalf of someone who lost their link and
  asked to cancel by phone).
- **Recap photos**: once a one-time event's `eventDate` has passed, an
  "Add recap photos" uploader appears on that event — multi-file select,
  client-side resize, upload to Blob, batch-insert into `eventPhotos`.
  This is the existing `GalleryUploader` component's pattern
  (`components/admin/gallery-uploader.tsx`) reused/adapted for an
  `eventId`-scoped photo set instead of the single global gallery.

## Public rendering

- `app/events/page.tsx`: "Upcoming" grid (event/occurrence cards — title,
  formatted date/time, location, cover image if set, payment-link button
  if set, RSVP button) and, below it, "Past events" showing each past
  one-time event with its recap photos (or nothing extra if none were
  uploaded yet — no empty-state clutter for events with no photos).
- `app/events/[id]/rsvp/page.tsx` (or a query param for which occurrence,
  since a recurring event has many): the RSVP form for a specific
  `(eventId, occurrenceDate)`.
- `app/events/rsvp/[token]/page.tsx`: edit/cancel an existing RSVP by its
  secret token.

## Image handling

- Cover image: plain `<img>` (not `next/image`), matching every other
  Blob-hosted image on this site — this project's `next.config.js` has no
  `remotePatterns` configured for the Blob domain, and the established
  convention (stories, gallery, sponsors) is `eslint-disable
  @next/next/no-img-element` rather than touching that config.
- Recap photos: same, rendered in a simple photo grid per past event
  (visually consistent with the existing `/gallery` page's grid).
- Blob upload routes: reuse `/api/admin/upload` (admin-authenticated,
  already supports arbitrary prefixes via `ALLOWED_PREFIXES` — add
  `'events/'` to that array) for both cover images and recap photos. RSVP
  submission itself never uploads anything, so no new *public* upload
  route is needed for this feature (unlike stories, which needed one for
  the unauthenticated submission form).

## Testing

Following this codebase's established Vitest conventions (mock `@/db` at
module level for action tests, pure-function unit tests for anything with
real logic, no component-level tests since none exist anywhere in this
project):

- `lib/event-occurrences.ts`'s `getOccurrences()`: the one piece of real
  domain logic in this feature — test it directly with fixed date ranges
  (e.g. "Thursdays between two fixed dates" produces the exact expected
  list, an inactive series outside its start/end range produces none, a
  range that doesn't include the target weekday at all produces none, an
  end date that lands exactly on the target weekday is inclusive).
- Admin `createEvent`/`updateEvent`: required-field validation, and that
  the type-specific date fields are stored correctly for each event type
  (a one-time event doesn't get recurring fields silently written, and
  vice versa).
- Public `submitRsvp`: required-field validation (name required), that a
  row is inserted with a freshly generated `editToken`, and that it is
  **not** possible to RSVP to a `occurrenceDate` outside the actual valid
  range for a recurring event's `dayOfWeek`/`startDate`/`endDate` (a
  crafted request for a Tuesday against a Thursday-only series, or a date
  past `endDate`, must be rejected) — this is the one place a client
  could submit a fabricated occurrence, since occurrences aren't rows
  with their own existence check.
- `updateRsvpByToken` / `cancelRsvpByToken`: token-not-found returns a
  clear error rather than throwing an unhandled exception, matching the
  story draft-edit action's `{ error: string } | void` return-value
  pattern (not throwing for expected "not found" cases).

## Open trade-offs (accepted, not blocking)

- No cascade delete for RSVPs/photos when an event is deleted (matches
  every other table in this schema having no FK constraints at all).
- No email delivery for lost edit links (see "Out of scope").
- No structured meal/ticket-quantity selection — free-text note only.
- Recurring "Upcoming" always shows a fixed number of future occurrences
  (6) rather than "all occurrences until the end date" — a series running
  for six months would otherwise flood the upcoming list with dozens of
  cards. Six weeks of visibility is enough for people to plan around a
  weekly event; this number can be tuned later without any schema change.
