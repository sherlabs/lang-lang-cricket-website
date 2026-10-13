import type { CollectionConfig } from 'payload'
import { validateAnnouncementLink } from '../../lib/selection/announcement-link'
import { isStaff, staffOr } from '../access'
import { cell, filterChips, saveState } from '../admin/formKit'
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
    custom: { committeeFacing: true },
    description: 'The newest one that is switched on shows as a banner on the home page.',
    components: {
      ...filterChips(
        [
          { key: 'showing', label: 'Showing', params: { 'where[published][equals]': 'true' } },
          { key: 'hidden', label: 'Hidden', params: { 'where[published][equals]': 'false' } },
        ],
        { label: 'Show announcements', allLabel: 'All announcements' },
      ),
      ...saveState(),
    },
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
        description: 'Leave a blank line between paragraphs. The first line is the banner.',
        placeholder: 'Write your message here.',
      },
    },
    {
      name: 'published',
      label: 'Show on the website',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { description: 'Switch off to take it down without deleting it.', components: { Cell: cell('OnOffCell', { on: 'Showing on the website', off: 'Hidden' }) } },
    },
    {
      name: 'link',
      label: 'Button link',
      type: 'text',
      maxLength: 500,
      validate: validateAnnouncementLink,
      admin: { description: 'Optional. A page here (such as /teams) or a full https:// link.', placeholder: '/teams' },
    },
    { name: 'linkLabel', label: 'Button text', type: 'text', maxLength: 40, admin: { description: 'Optional. Says "Read more" if empty.', placeholder: 'See the teams' } },
    // Set by the site when team selection is published (one announcement per weekend); never edited by hand.
    { name: 'autoKey', type: 'text', unique: true, index: true, hidden: true, access: { create: () => false, update: () => false } },
  ],
}
