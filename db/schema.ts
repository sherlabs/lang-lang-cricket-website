import { pgTable, serial, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core'

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
