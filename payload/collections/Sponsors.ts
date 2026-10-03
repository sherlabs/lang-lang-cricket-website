import type { CollectionConfig } from 'payload'
import { DEFAULT_TIER, TIER_ORDER } from '../../lib/sponsors'
import { anyone, isStaff } from '../access'
import { sortOrderField } from '../fields/sortOrderField'
import { httpUrlOrEmpty } from '../fields/validators'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { trimStrings } from '../hooks/trimStrings'

const PATHS = ['/sponsors', '/']

/** Sponsors (spec §3.5) ← `public.sponsors`. Within a tier, `sortOrder` then id. */
export const Sponsors: CollectionConfig = {
  slug: 'sponsors',
  admin: {
    group: 'Club',
    useAsTitle: 'name',
    defaultColumns: ['name', 'tier', 'sortOrder'],
  },
  defaultSort: 'tier',
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  hooks: {
    beforeValidate: [trimStrings(['name', 'linkUrl'])],
    afterChange: [revalidateAfterChange(PATHS)],
    afterDelete: [revalidateAfterDelete(PATHS)],
  },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'tier', type: 'select', required: true, defaultValue: DEFAULT_TIER, options: [...TIER_ORDER] },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Optional. Without a logo the sponsor name is shown as text.' },
    },
    { name: 'linkUrl', label: 'Link', type: 'text', defaultValue: '', validate: httpUrlOrEmpty },
    sortOrderField('Order within the tier; lower shows first.'),
  ],
}
