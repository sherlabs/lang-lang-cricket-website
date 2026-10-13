import type { CollectionConfig } from 'payload'
import { DEFAULT_TIER, TIER_ORDER } from '../../lib/sponsors'
import { anyone, isStaff } from '../access'
import { cell, detailsGroup, IMAGE_HINT, saveState, uploadPreview } from '../admin/formKit'
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
    custom: { committeeFacing: true },
    description: 'Businesses that support the club, shown on the Sponsors page by level.',
    components: saveState(),
  },
  defaultSort: 'tier',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  hooks: {
    beforeValidate: [trimStrings(['name', 'linkUrl'])],
    // A sponsor who backs players: remove those sponsorships first (their FK is NOT NULL).
    beforeDelete: [cascadeDelete([{ collection: 'player-sponsors', field: 'sponsor' }])],
    // The social pictures cache sponsor logos for a day; a changed or removed sponsor expires them at once.
    afterChange: [revalidateAfterChange(PATHS, ['sponsor-logos'])],
    afterDelete: [revalidateAfterDelete(PATHS, ['sponsor-logos'])],
  },
  timestamps: true,
  fields: [
    { name: 'name', label: 'Sponsor name', type: 'text', required: true, admin: { placeholder: 'e.g. Smith\'s Hardware', components: { Cell: cell('NamedPhotoCell', { imageField: 'logo', fit: 'contain' }) } } },
    {
      name: 'tier',
      label: 'Sponsor level',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_TIER,
      options: [...TIER_ORDER],
      admin: { description: 'Higher levels show first and bigger.', components: { Cell: cell('SponsorLevelCell') } },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: `${IMAGE_HINT} Without a logo the name is shown as text.`, components: uploadPreview({ fit: 'contain' }) },
    },
    {
      name: 'linkUrl',
      label: 'Sponsor website',
      type: 'text',
      defaultValue: '',
      validate: httpUrlOrEmpty,
      admin: { description: 'Optional. Where the logo takes people.', placeholder: 'https://www.example.com.au' },
    },
    detailsGroup([
      {
        ...sortOrderField('Order within the tier; lower shows first.'),
        label: 'Show before others (optional)',
        admin: { step: 1, description: 'Leave as 0. A smaller number, such as -1, shows first at its level.' },
      },
    ]),
  ],
}
