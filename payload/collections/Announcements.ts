import type { CollectionConfig } from 'payload'
import { validateAnnouncementLink } from '../../lib/selection/announcement-link'
import { isStaff, staffOr } from '../access'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { trimStrings } from '../hooks/trimStrings'

const PATHS = ['/', '/announcements']

/**
 * Announcements (spec §3.7) ← `public.announcements`. `createdAt` drives "latest"; the
 * `llcc_ann_dismissed` cookie stores the (preserved) numeric id.
 */
export const Announcements: CollectionConfig = {
  slug: 'announcements',
  labels: { singular: 'Announcement', plural: 'Announcements' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'title',
    defaultColumns: ['title', 'published', 'createdAt'],
    listSearchableFields: ['title', 'body'],
    description: 'News for members. The newest one that is switched on shows as a banner at the top of the home page.',
  },
  defaultSort: '-createdAt',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
  access: {
    read: staffOr({ published: { equals: true } }),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [trimStrings(['title', 'body'])],
    afterChange: [revalidateAfterChange(PATHS)],
    afterDelete: [revalidateAfterDelete(PATHS)],
  },
  timestamps: true,
  fields: [
    { name: 'title', label: 'Headline', type: 'text', required: true, admin: { placeholder: 'e.g. Presentation night is this Friday' } },
    {
      name: 'body',
      label: 'Message',
      type: 'textarea',
      defaultValue: '',
      admin: {
        description: 'Leave a blank line between paragraphs. The first line shows in the banner on the home page.',
        placeholder: 'Write your message here.',
      },
    },
    {
      name: 'published',
      label: 'Show on the website',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { description: 'Nothing shows on the website until this is switched on. Switch it off later to take the announcement down without deleting it.' },
    },
    {
      name: 'link',
      label: 'Button link',
      type: 'text',
      maxLength: 500,
      validate: validateAnnouncementLink,
      admin: { description: 'Optional. A page on this site (starting with /, for example /teams) or a link starting with https://. Adds a button to the banner.', placeholder: '/teams' },
    },
    { name: 'linkLabel', label: 'Button text', type: 'text', maxLength: 40, admin: { description: 'Optional. Defaults to "Read more".', placeholder: 'See the teams' } },
    // Set by the site when team selection is published (one announcement per weekend); never edited by hand.
    { name: 'autoKey', type: 'text', unique: true, index: true, hidden: true, access: { create: () => false, update: () => false } },
  ],
}
