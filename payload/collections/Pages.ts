import type { CollectionConfig } from 'payload'
import { isAdminField, isStaff, nobodyField, staffOr } from '../access'
import { adminOnlyCondition } from '../admin/visibility'
import { MAX_PAGE_BLOCKS, pageBlocks } from '../fields/blocks'
import { allOf, maxChars, slugValidator } from '../fields/validators'
import { stampPublishedAt } from '../hooks/publishedAt'
import { revalidatePaths } from '../hooks/revalidate'
import { editableSlug } from '../hooks/slug'
import { trimStrings } from '../hooks/trimStrings'

export const PAGE_STATUSES = ['draft', 'published'] as const
export const PAGE_PLACEMENTS = ['none', 'clubhouse', 'primary', 'footer'] as const
/** Slugs a page may not take (the section root). */
export const PAGE_RESERVED_SLUGS: ReadonlySet<string> = new Set(['index'])

const paths = (doc: Record<string, unknown>) => ['/sitemap.xml', ...(doc.slug ? [`/info/${doc.slug}`] : [])]

/** Pages change the menu and footer on every route: drop the cached nav list and the whole root layout. */
const revalidateAfter = async ({ doc, previousDoc, req }: { doc: Record<string, unknown>; previousDoc?: Record<string, unknown>; req: { context: Record<string, unknown> } }) => {
  const all = new Set([...paths(doc), ...(previousDoc ? paths(previousDoc) : [])])
  await revalidatePaths([...all], req.context, ['nav-pages'])
  await revalidatePaths(['/'], req.context, [], { layout: true })
}

/**
 * Info pages (WP-P, issue #22): About, Join us, Ground and directions. A custom `status` select (as for
 * stories), not Payload drafts. Public routes read it through `lib/pages-queries.ts`, which states its own
 * published filter; the staff-only preview route renders drafts.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'showInNavigation', 'updatedAt'],
    listSearchableFields: ['title', 'slug'],
    description: 'Information pages such as About the club or Join us. Add text, pictures and buttons, then choose where the link goes in the menu. For dated news use News; for short banners use Announcements.',
    preview: (doc) => `/preview/pages/${doc.id}`,
  },
  defaultSort: 'title',
  disableDuplicate: true,
  access: {
    read: staffOr({ status: { equals: 'published' } }),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [trimStrings(['title', 'navLabel', 'seoTitle', 'seoDescription']), stampPublishedAt],
    afterChange: [async ({ doc, previousDoc, req }) => { await revalidateAfter({ doc, previousDoc, req }); return doc }],
    afterDelete: [async ({ doc, req }) => { await revalidateAfter({ doc, req }); return doc }],
  },
  timestamps: true,
  fields: [
    { name: 'title', label: 'Page title', type: 'text', required: true, validate: maxChars(200, { required: true }), admin: { placeholder: 'e.g. Join the club' } },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      // Set from the title on create; only an admin may change it afterwards (links to the old address would break).
      access: { create: nobodyField, update: isAdminField },
      validate: slugValidator,
      hooks: { beforeChange: [editableSlug('pages', PAGE_RESERVED_SLUGS)] },
      admin: { position: 'sidebar', condition: adminOnlyCondition(), description: 'The page address, /info/<this>. Set from the title when the page is created. Changing it breaks links to the old address.' },
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
      label: 'Published on',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' }, description: 'Filled in the first time you publish.' },
    },
    {
      name: 'showInNavigation',
      label: 'Where should a link to this page appear?',
      type: 'select',
      required: true,
      defaultValue: 'clubhouse',
      options: [
        { label: 'Nowhere (only people with the address can find it)', value: 'none' },
        { label: 'In the Clubhouse menu', value: 'clubhouse' },
        { label: 'In the main menu (the top bar; room for two)', value: 'primary' },
        { label: 'In the footer only', value: 'footer' },
      ],
      admin: { position: 'sidebar', description: 'A draft page never shows in the menu.' },
    },
    {
      name: 'navLabel',
      label: 'Menu wording (optional)',
      type: 'text',
      defaultValue: '',
      validate: maxChars(40),
      admin: { position: 'sidebar', description: 'A shorter name for the menu. Leave empty to use the page title.' },
    },
    {
      name: 'navOrder',
      label: 'Menu order',
      type: 'number',
      defaultValue: 100,
      min: 0,
      max: 9999,
      admin: { position: 'sidebar', step: 1, description: 'Smaller numbers come first. Leave as it is to go last.' },
    },
    {
      name: 'content',
      label: 'Page content',
      type: 'blocks',
      blocks: pageBlocks,
      maxRows: MAX_PAGE_BLOCKS,
      admin: { description: 'Add text, pictures and buttons, and drag them into the order you want.', initCollapsed: false },
    },
    {
      type: 'collapsible',
      label: 'Search engines and sharing (optional)',
      admin: { initCollapsed: true },
      fields: [
        { name: 'seoTitle', label: 'Title for search engines', type: 'text', defaultValue: '', validate: maxChars(60), admin: { description: 'Up to 60 characters. Leave empty to use the page title.' } },
        { name: 'seoDescription', label: 'Description for search engines', type: 'textarea', defaultValue: '', validate: allOf(maxChars(160)), admin: { description: 'Up to 160 characters. Leave empty to use the start of the first text block.' } },
        { name: 'ogImage', label: 'Picture when shared', type: 'upload', relationTo: 'media', admin: { description: 'Shown when the page is shared on Facebook and similar. Leave empty to use the club picture.' } },
      ],
    },
  ],
}
