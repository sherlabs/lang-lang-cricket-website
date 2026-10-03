import type { CollectionConfig } from 'payload'
import { isStaff, isStaffField, nobodyField, staffOr } from '../access'
import { storyEditor } from '../editor/storyLexical'
import { tokenField } from '../fields/tokenField'
import { allOf, emailOrEmpty, maxChars } from '../fields/validators'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { uniqueSlug } from '../hooks/slug'
import { defaultAuthorName, storyLifecycle } from '../hooks/storyLifecycle'

const paths = (doc: Record<string, unknown>) => (doc.slug ? ['/history', `/history/${doc.slug}`] : ['/history'])

/** Hook-owned: read-only in the admin AND unwritable over REST (spec §2: `admin.readOnly` is UI only). */
const hookOwned = { create: nobodyField, update: nobodyField }

export const STORY_STATUSES = ['pending', 'published', 'rejected'] as const

/**
 * Stories (spec §3.11) ← `public.stories`. Moderation is a custom `status` select, not Payload
 * drafts. Public submissions and token edits come in through server actions (Local API,
 * `context.publicSubmission`); `storyLifecycle` enforces the public-edit rule itself.
 */
export const Stories: CollectionConfig = {
  slug: 'stories',
  labels: { singular: 'Story', plural: 'Stories' },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'authorName', 'createdAt'],
    listSearchableFields: ['title', 'authorName'],
    components: {
      beforeList: ['/payload/components/PendingQueueBanner#PendingQueueBanner'],
      edit: { beforeDocumentControls: ['/payload/components/StoryModerationControls#StoryModerationControls'] },
    },
  },
  defaultSort: '-createdAt',
  access: {
    read: staffOr({ status: { equals: 'published' } }),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [defaultAuthorName],
    beforeChange: [storyLifecycle],
    afterChange: [revalidateAfterChange(paths)],
    afterDelete: [revalidateAfterDelete(paths)],
  },
  timestamps: true,
  fields: [
    { name: 'title', type: 'text', required: true, validate: maxChars(200, { required: true }) },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      access: hookOwned,
      hooks: { beforeChange: [uniqueSlug('stories')] },
      admin: { position: 'sidebar', readOnly: true, description: 'Set from the title when the story is created; never changes.' },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      defaultValue: '',
      admin: { description: 'Shown on the history page cards. Leave empty to use the start of the story.' },
    },
    { name: 'content', type: 'richText', editor: storyEditor, required: true },
    { name: 'coverImage', type: 'upload', relationTo: 'media' },
    {
      name: 'authorName',
      type: 'text',
      required: true,
      validate: maxChars(200, { required: true }),
      admin: { description: 'Shown as "By …". Defaults to the club name for stories written here.' },
    },
    {
      name: 'authorEmail',
      type: 'text',
      defaultValue: '',
      validate: allOf(maxChars(200), emailOrEmpty),
      // Never public (spec §2, A1): only the admin and the token-gated edit page show it.
      access: { read: isStaffField },
      admin: { description: 'Given by the submitter; never published.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: ({ user }) => (user ? 'published' : 'pending'),
      options: [
        { label: 'Pending review', value: 'pending' },
        { label: 'Published', value: 'published' },
        { label: 'Rejected', value: 'rejected' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'submittedByAdmin',
      type: 'checkbox',
      defaultValue: false,
      // Moderation field: staff-only over REST/GraphQL (spec §2); public pages read via the Local API.
      access: { ...hookOwned, read: isStaffField },
      admin: { position: 'sidebar', readOnly: true, description: 'Written in the admin rather than sent in by the public.' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      access: hookOwned,
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'reviewedAt',
      type: 'date',
      access: { ...hookOwned, read: isStaffField },
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    tokenField('editToken'),
    tokenField('viewToken'),
    {
      name: 'submitterLinks',
      type: 'ui',
      admin: { position: 'sidebar', components: { Field: '/payload/components/StoryLinksField#StoryLinksField' } },
    },
  ],
}
