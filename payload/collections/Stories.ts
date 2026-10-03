import type { CollectionConfig } from 'payload'
import { isStaff, isStaffField, nobodyField, staffOr } from '../access'
import { adminOnlyCondition } from '../admin/visibility'
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
  labels: { singular: 'Club history story', plural: 'Club history stories' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'authorName', 'createdAt'],
    description: 'Memories and stories about the club. Members can send them in from the website; they wait here for you to approve.',
    listSearchableFields: ['title', 'authorName'],
    components: {
      beforeList: ['/payload/components/PendingQueueBanner#PendingQueueBanner'],
      edit: { beforeDocumentControls: ['/payload/components/StoryModerationControls#StoryModerationControls'] },
    },
  },
  defaultSort: '-createdAt',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
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
    { name: 'title', label: 'Title', type: 'text', required: true, validate: maxChars(200, { required: true }), admin: { placeholder: 'e.g. Our first premiership' } },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      access: hookOwned,
      hooks: { beforeChange: [uniqueSlug('stories')] },
      admin: { position: 'sidebar', readOnly: true, condition: adminOnlyCondition(), description: 'Set from the title when the story is created; never changes.' },
    },
    { name: 'content', label: 'The story', type: 'richText', editor: storyEditor, required: true },
    {
      name: 'coverImage',
      label: 'Picture (optional)',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Click the button, then drop the picture in.' },
    },
    {
      name: 'authorName',
      label: 'Written by',
      type: 'text',
      required: true,
      validate: maxChars(200, { required: true }),
      admin: { description: 'Shown as "By …". Type your name, or the club name.' },
    },
    {
      name: 'excerpt',
      label: 'Short summary (optional)',
      type: 'textarea',
      defaultValue: '',
      admin: { description: 'Shown on the story card. Leave empty and the start of the story is used.' },
    },
    {
      name: 'authorEmail',
      label: 'Their email',
      type: 'text',
      defaultValue: '',
      validate: allOf(maxChars(200), emailOrEmpty),
      // Never public (spec §2, A1): only the admin and the token-gated edit page show it.
      access: { read: isStaffField },
      admin: { description: 'Given by the person who sent it in. Never shown on the website.' },
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: ({ user }) => (user ? 'published' : 'pending'),
      options: [
        { label: 'Waiting for approval', value: 'pending' },
        { label: 'On the website', value: 'published' },
        { label: 'Not shown (said no)', value: 'rejected' },
      ],
      admin: { position: 'sidebar', description: 'Use the Approve button at the top, or choose here.' },
    },
    {
      name: 'submittedByAdmin',
      type: 'checkbox',
      defaultValue: false,
      // Moderation field: staff-only over REST/GraphQL (spec §2); public pages read via the Local API.
      access: { ...hookOwned, read: isStaffField },
      admin: { position: 'sidebar', readOnly: true, condition: adminOnlyCondition(), description: 'Written in the admin rather than sent in by the public.' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      access: hookOwned,
      admin: { position: 'sidebar', readOnly: true, condition: adminOnlyCondition(), date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'reviewedAt',
      type: 'date',
      access: { ...hookOwned, read: isStaffField },
      admin: { position: 'sidebar', readOnly: true, condition: adminOnlyCondition(), date: { pickerAppearance: 'dayAndTime' } },
    },
    tokenField('editToken'),
    tokenField('viewToken'),
    {
      name: 'submitterLinks',
      type: 'ui',
      admin: { position: 'sidebar', condition: adminOnlyCondition(), components: { Field: '/payload/components/StoryLinksField#StoryLinksField' } },
    },
  ],
}
