import type { CollectionConfig } from 'payload'
import { DEFAULT_TIER, TIER_ORDER } from '../../lib/sponsors'
import { anyone, isStaff } from '../access'
import { sortOrderField } from '../fields/sortOrderField'
import { httpUrlOrEmpty } from '../fields/validators'
import { cascadeDelete } from '../hooks/cascadeDelete'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { trimStrings } from '../hooks/trimStrings'

const PATHS = ['/sponsors', '/']

/** Sponsors (spec §3.5) ← `public.sponsors`. Within a tier, `sortOrder` then id. */
export const Sponsors: CollectionConfig = {
  slug: 'sponsors',
  labels: { singular: 'Sponsor', plural: 'Sponsors' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'name',
    defaultColumns: ['name', 'tier', 'linkUrl'],
    listSearchableFields: ['name'],
    description: 'Businesses that support the club. They appear on the Sponsors page, grouped by level.',
  },
  defaultSort: 'tier',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  hooks: {
    beforeValidate: [trimStrings(['name', 'linkUrl'])],
    // A sponsor who backs players: remove those sponsorships first (their FK is NOT NULL).
    beforeDelete: [cascadeDelete([{ collection: 'player-sponsors', field: 'sponsor' }])],
    afterChange: [revalidateAfterChange(PATHS)],
    afterDelete: [revalidateAfterDelete(PATHS)],
  },
  timestamps: true,
  fields: [
    { name: 'name', label: 'Sponsor name', type: 'text', required: true, admin: { placeholder: 'e.g. Lang Lang Hardware' } },
    {
      name: 'tier',
      label: 'Sponsor level',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_TIER,
      options: [...TIER_ORDER],
      admin: { description: 'Higher levels are shown first and bigger. If unsure, leave it as it is.' },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Optional. Click the button, then drop the logo picture in. Without a logo the sponsor name is shown as text.' },
    },
    {
      name: 'linkUrl',
      label: 'Sponsor website',
      type: 'text',
      defaultValue: '',
      validate: httpUrlOrEmpty,
      admin: { description: 'Optional. Where the logo should take people when clicked.', placeholder: 'https://www.example.com.au' },
    },
    {
      ...sortOrderField('Order within the tier; lower shows first.'),
      label: 'Show before others (optional)',
      admin: { step: 1, description: 'Leave as 0. A smaller number (such as -1) shows this sponsor before others at the same level.' },
    },
  ],
}
