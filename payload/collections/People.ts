import type { CollectionConfig } from 'payload'
import { DEFAULT_SECTION, PEOPLE_SECTIONS } from '../../lib/people'
import { anyone, isStaff } from '../access'
import { sortOrderField } from '../fields/sortOrderField'
import { emailOrEmpty } from '../fields/validators'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { trimStrings } from '../hooks/trimStrings'

const PATHS = ['/', '/contact', '/people']

/** Examples for the admin description (the old form's datalist suggested the roles already in use). */
const ROLE_SUGGESTIONS = [
  'President',
  'Vice President',
  'Secretary',
  'Treasurer',
  'Child Safety Officer',
  'Junior Coordinator',
  'Senior Captain',
  'Coach',
]

/** People (spec §3.6) ← `public.committee_contacts`. */
export const People: CollectionConfig = {
  slug: 'people',
  labels: { singular: 'Person', plural: 'People' },
  admin: {
    group: 'Club',
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'section', 'sortOrder'],
  },
  defaultSort: 'sortOrder',
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  hooks: {
    beforeValidate: [trimStrings(['name', 'role', 'phone', 'email'])],
    afterChange: [revalidateAfterChange(PATHS)],
    afterDelete: [revalidateAfterDelete(PATHS)],
  },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'text',
      required: true,
      admin: { description: `For example: ${ROLE_SUGGESTIONS.join(', ')}.` },
    },
    {
      name: 'section',
      type: 'select',
      defaultValue: DEFAULT_SECTION,
      options: PEOPLE_SECTIONS.map((s) => ({ label: s.label, value: s.key })),
      admin: { description: 'Which group the person is listed under on /people and the contact page.' },
    },
    { name: 'phone', type: 'text', defaultValue: '' },
    { name: 'email', type: 'text', defaultValue: '', validate: emailOrEmpty },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Shown square; use the crop tool on the image to frame the face.' },
    },
    sortOrderField(),
  ],
}
