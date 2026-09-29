import { pgTable, serial, text, timestamp, integer, jsonb, boolean, unique } from 'drizzle-orm/pg-core'

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(), // 'Codes of Conduct' | 'Policies' | 'Child Safety' | 'Game Day' | 'CCCA Directory'
  title: text('title').notNull(),
  url: text('url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const galleryPhotos = pgTable('gallery_photos', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  caption: text('caption').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const sponsors = pgTable('sponsors', {
  id: serial('id').primaryKey(),
  tier: text('tier').notNull(), // 'Platinum' | 'Gold' | 'Silver' | 'Bronze'
  name: text('name').notNull(),
  logoUrl: text('logo_url').notNull(),
  linkUrl: text('link_url').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const committeeContacts = pgTable('committee_contacts', {
  id: serial('id').primaryKey(),
  role: text('role').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  photoUrl: text('photo_url').notNull().default(''),
  // 'committee' | 'leadership' | 'coach' — which group the person is listed under; see lib/people.ts
  section: text('section').notNull().default('committee'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const stories = pgTable('stories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  contentJson: jsonb('content_json').notNull(),
  contentHtml: text('content_html').notNull(),
  coverImageUrl: text('cover_image_url').notNull().default(''),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull().default(''),
  submittedByAdmin: boolean('submitted_by_admin').notNull().default(false),
  status: text('status').notNull().default('pending'), // 'pending' | 'published' | 'rejected'
  // Unguessable secrets shared only with the submitter — not shown anywhere
  // public. editToken grants edit access regardless of status; viewToken
  // grants read-only access regardless of status (for previewing before
  // approval). Neither is a substitute for real auth — anyone with the link
  // has full access to what it grants, forever.
  editToken: text('edit_token').notNull().unique(),
  viewToken: text('view_token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  publishedAt: timestamp('published_at'),
  reviewedAt: timestamp('reviewed_at'),
})

export type Story = typeof stories.$inferSelect

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // 'one_time' | 'recurring'
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  location: text('location').notNull().default(''),
  coverImageUrl: text('cover_image_url').notNull().default(''),
  paymentLinkLabel: text('payment_link_label').notNull().default(''),
  paymentLinkUrl: text('payment_link_url').notNull().default(''),
  eventTime: text('event_time').notNull().default(''), // "HH:mm", both types
  // one_time only:
  eventDate: timestamp('event_date'), // UTC midnight of the day — see Task 4
  // recurring only:
  dayOfWeek: integer('day_of_week'), // 0 (Sun) - 6 (Sat)
  startDate: timestamp('start_date'), // UTC midnight
  endDate: timestamp('end_date'), // UTC midnight
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Event = typeof events.$inferSelect

export const eventRsvps = pgTable('event_rsvps', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  occurrenceDate: timestamp('occurrence_date').notNull(), // full timestamp, time merged in — see Task 2
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  note: text('note').notNull().default(''),
  editToken: text('edit_token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type EventRsvp = typeof eventRsvps.$inferSelect

export const eventPhotos = pgTable('event_photos', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  url: text('url').notNull(),
  caption: text('caption').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  // 'approved' | 'pending'. Admin-added photos (addEventPhotos) default to
  // 'approved' and are immediately public. Publicly submitted photos
  // (submitEventPhoto) go in as 'pending' and only become public once an
  // admin calls approveEventPhoto.
  status: text('status').notNull().default('approved'),
  // Who submitted the photo, for admin context only — public, optional,
  // no auth behind it (matches this feature's "no heavy auth" stance).
  submitterName: text('submitter_name').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type EventPhoto = typeof eventPhotos.$inferSelect

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''), // plain text or simple text with line breaks — NOT a rich editor like stories, keep this simple
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Announcement = typeof announcements.$inferSelect

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  photoUrl: text('photo_url').notNull().default(''),
  bio: text('bio').notNull().default(''), // plain text; paragraphs split on blank lines
  source: text('source').notNull(), // 'playhq' | 'manual'
  manualYears: text('manual_years').notNull().default(''), // manual players only, e.g. "1978–1992"
  activeOverride: text('active_override'), // null (auto) | 'active' | 'past'
  isActiveDerived: boolean('is_active_derived').notNull().default(false), // written by sync only
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
export type Player = typeof players.$inferSelect

// PlayHQ has no stable player id — a name key (`first|last` lower-cased) maps
// appearances to a player. Merging players moves aliases, so merges survive syncs.
export const playerAliases = pgTable('player_aliases', {
  nameKey: text('name_key').primaryKey(),
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
})

export const playerHonours = pgTable('player_honours', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  years: text('years').notNull(),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
})
export type PlayerHonour = typeof playerHonours.$inferSelect

// One row per player × PlayHQ team (a team belongs to one season). Raw counts only;
// averages are derived at read time. Fully rewritten by every sync.
export const playerSeasons = pgTable(
  'player_seasons',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    seasonName: text('season_name').notNull(),
    seasonOrder: integer('season_order').notNull(), // 0 = newest senior season group
    teamId: text('team_id').notNull(),
    teamName: text('team_name').notNull(),
    gradeName: text('grade_name'),
    games: integer('games').notNull().default(0),
    batInnings: integer('bat_innings').notNull().default(0),
    batNotOuts: integer('bat_not_outs').notNull().default(0),
    batRuns: integer('bat_runs').notNull().default(0),
    batHighScore: integer('bat_high_score').notNull().default(0),
    batHighScoreNotOut: boolean('bat_high_score_not_out').notNull().default(false),
    batBalls: integer('bat_balls').notNull().default(0),
    batFours: integer('bat_fours').notNull().default(0),
    batSixes: integer('bat_sixes').notNull().default(0),
    bowlBalls: integer('bowl_balls').notNull().default(0),
    bowlMaidens: integer('bowl_maidens').notNull().default(0),
    bowlRuns: integer('bowl_runs').notNull().default(0),
    bowlWickets: integer('bowl_wickets').notNull().default(0),
    bowlBestWickets: integer('bowl_best_wickets').notNull().default(0),
    bowlBestRuns: integer('bowl_best_runs').notNull().default(0),
    catches: integer('catches').notNull().default(0),
  },
  (t) => [unique('player_seasons_player_team').on(t.playerId, t.teamId)]
)
export type PlayerSeason = typeof playerSeasons.$inferSelect

export const playerSyncRuns = pgTable('player_sync_runs', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
  status: text('status').notNull(), // 'running' | 'ok' | 'error'
  playersCreated: integer('players_created').notNull().default(0),
  seasonRows: integer('season_rows').notNull().default(0),
  error: text('error'),
})
export type PlayerSyncRun = typeof playerSyncRuns.$inferSelect
