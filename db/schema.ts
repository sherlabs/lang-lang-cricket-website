import { pgTable, serial, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core'

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
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const fixtures = pgTable('fixtures', {
  id: serial('id').primaryKey(),
  team: text('team').notNull(),
  opponent: text('opponent').notNull(),
  venue: text('venue').notNull().default(''),
  matchDate: timestamp('match_date').notNull(),
  isResult: boolean('is_result').notNull().default(false),
  resultSummary: text('result_summary').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
