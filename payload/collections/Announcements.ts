import type { CollectionConfig } from 'payload'
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
  admin: {
    group: 'Club',
    useAsTitle: 'title',
    defaultColumns: ['title', 'published', 'createdAt'],
  },
  defaultSort: '-createdAt',
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
    { name: 'title', type: 'text', required: true },
    {
      name: 'body',
      type: 'textarea',
      defaultValue: '',
      admin: { description: 'Plain text. Leave a blank line between paragraphs. The first line shows in the home page banner.' },
    },
    {
      name: 'published',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { description: 'The newest published announcement shows as a banner on the home page.' },
    },
  ],
}
