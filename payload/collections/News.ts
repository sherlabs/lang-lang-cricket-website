import type { Access, CollectionConfig, Validate } from 'payload'
import { isAdminField, isStaff, nobodyField } from '../access'
import { publishedNow } from '../../lib/news-visibility'
import { adminOnlyCondition } from '../admin/visibility'
import { storyEditor } from '../editor/storyLexical'
import { maxChars, slugValidator } from '../fields/validators'
import { stampPublishedAt } from '../hooks/publishedAt'
import { revalidatePaths } from '../hooks/revalidate'
import { editableSlug } from '../hooks/slug'
import { trimStrings } from '../hooks/trimStrings'

export const NEWS_STATUSES = ['draft', 'published'] as const

const paths = (doc: Record<string, unknown>) => ['/news', '/', '/sitemap.xml', ...(doc.slug ? [`/news/${doc.slug}`] : [])]

const revalidateAfter = async (doc: Record<string, unknown>, previousDoc: Record<string, unknown> | undefined, context: Record<string, unknown>) => {
  const all = new Set([...paths(doc), ...(previousDoc ? paths(previousDoc) : [])])
  // `nav-pages` also carries "is there any news", which decides whether the menu links to /news.
  await revalidatePaths([...all], context, ['nav-pages'])
  await revalidatePaths(['/'], context, [], { layout: true })
}

/**
 * Anonymous reads see published posts whose date has come. Evaluated per request (a function, not a
 * constant), so a post scheduled for the future turns visible on its own.
 */
export const readNews: Access = ({ req }) => {
  if (req.user) return true
  return publishedNow()
}

const publishedNeedsDate: Validate = (value, { siblingData }) => {
  const status = (siblingData as { status?: string } | undefined)?.status
  return status === 'published' && !value ? 'Choose a date, or leave it empty and it is filled in when you publish.' : true
}

/**
 * News posts (WP-P, issue #22): dated club articles with a picture, shown in a feed, in the home strip
 * and in the sitemap. Not the same as Announcements (short banners) or Club history stories (long-lived
 * pieces, members send them in). A future `publishedAt` schedules the post.
 */
export const News: CollectionConfig = {
  slug: 'news',
  labels: { singular: 'News post', plural: 'News' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'publishedAt', 'updatedAt'],
    listSearchableFields: ['title', 'excerpt', 'author'],
    description: 'Dated club news with a picture, such as a result, a signing or a thank-you. For a short banner on the home page use Announcements; for the club’s long-lived history use Club history stories.',
    preview: (doc) => `/preview/news/${doc.id}`,
  },
  defaultSort: '-publishedAt',
  disableDuplicate: true,
  access: {
    read: readNews,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [trimStrings(['title', 'excerpt', 'author', 'seoTitle', 'seoDescription']), stampPublishedAt],
    afterChange: [async ({ doc, previousDoc, req }) => { await revalidateAfter(doc, previousDoc, req.context); return doc }],
    afterDelete: [async ({ doc, req }) => { await revalidateAfter(doc, undefined, req.context); return doc }],
  },
  timestamps: true,
  fields: [
    { name: 'title', label: 'Headline', type: 'text', required: true, validate: maxChars(200, { required: true }), admin: { placeholder: 'e.g. A Grade win the grand final' } },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      access: { create: nobodyField, update: isAdminField },
      validate: slugValidator,
      hooks: { beforeChange: [editableSlug('news', new Set())] },
      admin: { position: 'sidebar', condition: adminOnlyCondition(), description: 'The post address, /news/<this>. Set from the headline when the post is created.' },
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft (not on the website)', value: 'draft' },
        { label: 'Published (on the website)', value: 'published' },
      ],
      admin: { position: 'sidebar', description: 'Keep it as Draft while you work. Use the Preview button to see it first.' },
    },
    {
      name: 'publishedAt',
      label: 'Show from',
      type: 'date',
      index: true,
      validate: publishedNeedsDate,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Filled in with now when you publish. Pick a later date and time to schedule the post: it appears on the website by itself (it can take up to five minutes after that time).',
      },
    },
    { name: 'cover', label: 'Picture (optional)', type: 'upload', relationTo: 'media', admin: { description: 'Shown at the top of the post and on the news list. Click the button, then drop the picture in.' } },
    {
      name: 'excerpt',
      label: 'Short summary (optional)',
      type: 'textarea',
      defaultValue: '',
      validate: maxChars(280),
      admin: { description: 'Up to 280 characters, shown on the news list. Leave empty and the start of the post is used.' },
    },
    { name: 'body', label: 'The post', type: 'richText', editor: storyEditor, required: true },
    {
      name: 'author',
      label: 'Written by (optional)',
      type: 'text',
      defaultValue: '',
      validate: maxChars(200),
      admin: { description: 'Shown as "By …". Leave empty to credit the club.' },
    },
    {
      type: 'collapsible',
      label: 'Search engines and sharing (optional)',
      admin: { initCollapsed: true },
      fields: [
        { name: 'seoTitle', label: 'Title for search engines', type: 'text', defaultValue: '', validate: maxChars(60), admin: { description: 'Up to 60 characters. Leave empty to use the headline.' } },
        { name: 'seoDescription', label: 'Description for search engines', type: 'textarea', defaultValue: '', validate: maxChars(160), admin: { description: 'Up to 160 characters. Leave empty to use the summary.' } },
      ],
    },
  ],
}
