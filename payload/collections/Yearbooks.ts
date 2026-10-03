import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { isStaff, nobodyField, staffOr } from '../access'
import { maxChars } from '../fields/validators'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { uniqueSlug } from '../hooks/slug'
import { trimStrings } from '../hooks/trimStrings'

export const YEARBOOK_STATUSES = ['draft', 'published'] as const

/** The shape of `player-seasons.seasonName` as PlayHQ names it: "Summer 2025/26". */
export const SEASON_NAME_RE = /^[A-Za-z]+ \d{4}\/\d{2}$/

const MESSAGE_MAX = 6000

const paths = (doc: Record<string, unknown>) => (doc.slug ? ['/yearbooks', `/yearbooks/${doc.slug}`] : ['/yearbooks'])

/** Hook-owned: read-only in the admin AND unwritable over REST (spec §2: `admin.readOnly` is UI only). */
const hookOwned = { create: nobodyField, update: nobodyField }

/** Stamps `publishedAt` the first time a yearbook is published (used for JSON-LD `datePublished`). */
const stampPublishedAt: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data.status === 'published' && !(originalDoc as { publishedAt?: string | null } | undefined)?.publishedAt && !data.publishedAt) {
    data.publishedAt = new Date().toISOString()
  }
  return data
}

const seasonName = (value: unknown, ctx?: { req?: { context?: Record<string, unknown> } }): true | string => {
  if (ctx?.req?.context?.etl === true) return true
  return typeof value === 'string' && SEASON_NAME_RE.test(value.trim()) ? true : 'Use the PlayHQ season name, for example "Summer 2025/26".'
}

/**
 * Season yearbooks (BetterStats spec A9). Editorial text, cover, photos and sponsors live here;
 * every statistic on the page is computed at request time. Moderation reuses the Stories
 * pattern: a custom `status` select rather than Payload drafts (no version tables).
 */
export const Yearbooks: CollectionConfig = {
  slug: 'yearbooks',
  labels: { singular: 'Yearbook', plural: 'Yearbooks' },
  admin: {
    group: 'Club',
    useAsTitle: 'title',
    defaultColumns: ['title', 'seasonName', 'status', 'updatedAt'],
    listSearchableFields: ['title', 'seasonName'],
    description:
      'One page per season, with your messages and photos beside the stats worked out automatically. Do not upload unreleased photos until you publish: files are reachable by direct link even while the yearbook is a draft.',
  },
  defaultSort: '-seasonName',
  access: {
    // Protects REST only. Public pages use the Local API (overrideAccess), so every query in
    // lib/yearbooks-queries.ts states the `published` filter itself.
    read: staffOr({ status: { equals: 'published' } }),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [trimStrings(['title', 'seasonName', 'premiership'])],
    beforeChange: [stampPublishedAt],
    afterChange: [revalidateAfterChange(paths)],
    afterDelete: [revalidateAfterDelete(paths)],
  },
  timestamps: true,
  fields: [
    { name: 'title', type: 'text', required: true, validate: maxChars(200, { required: true }), admin: { description: 'For example "2025/26 Yearbook".' } },
    {
      name: 'seasonName',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: seasonName,
      admin: {
        description: 'Exactly as PlayHQ names the season, for example "Summer 2025/26". The stats and results on the page come from this season.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      access: hookOwned,
      hooks: { beforeChange: [uniqueSlug('yearbooks', 'seasonName')] },
      admin: { position: 'sidebar', readOnly: true, description: 'Set from the season when the yearbook is created; never changes.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft (not public)', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      access: hookOwned,
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'cover', type: 'upload', relationTo: 'media' },
    {
      name: 'premiership',
      type: 'text',
      defaultValue: '',
      validate: maxChars(120),
      admin: { description: 'Optional headline, for example "A Grade premiers".' },
    },
    { name: 'presidentMessage', type: 'textarea', defaultValue: '', validate: maxChars(MESSAGE_MAX), admin: { description: 'Leave a blank line between paragraphs.' } },
    { name: 'coachMessage', type: 'textarea', defaultValue: '', validate: maxChars(MESSAGE_MAX), admin: { description: 'Leave a blank line between paragraphs.' } },
    { name: 'sponsorMessage', type: 'textarea', defaultValue: '', validate: maxChars(MESSAGE_MAX), admin: { description: 'Leave a blank line between paragraphs.' } },
    { name: 'photos', type: 'relationship', relationTo: 'gallery-photos', hasMany: true },
    { name: 'featuredSponsors', type: 'relationship', relationTo: 'sponsors', hasMany: true },
  ],
}
