import type { CollectionConfig, RequestContext } from 'payload'
import { DEFAULT_SECTION, PEOPLE_SECTIONS } from '../../lib/people'
import { anyone, isStaff } from '../access'
import { cell, IMAGE_HINT, saveState, uploadPreview } from '../admin/formKit'
import { sortOrderField } from '../fields/sortOrderField'
import { emailOrEmpty } from '../fields/validators'
import { revalidatePlayerProfiles } from '../../lib/players/revalidate'
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

async function revalidateLinkedPlayer(context: RequestContext | undefined) {
  if (context?.disableRevalidate) return
  await revalidatePlayerProfiles()
}

/** People (spec §3.6) ← `public.committee_contacts`. */
export const People: CollectionConfig = {
  slug: 'people',
  labels: { singular: 'Person', plural: 'Committee & contacts' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'phone'],
    listSearchableFields: ['name', 'role'],
    custom: { committeeFacing: true },
    description: 'Committee members, coaches and contacts shown on the Contact and People pages.',
    components: saveState(),
  },
  defaultSort: 'sortOrder',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  hooks: {
    beforeValidate: [
      trimStrings(['name', 'role', 'phone', 'email']),
      // Trim each extra job's label so a blank one fails `required` instead of saving as ''.
      ({ data, req }) => {
        if (!data || req.context?.etl || !Array.isArray(data.moreRoles)) return data
        data.moreRoles = data.moreRoles.map((r: unknown) =>
          r && typeof r === 'object' && typeof (r as { role?: unknown }).role === 'string' ? { ...r, role: (r as { role: string }).role.trim() } : r,
        )
        return data
      },
    ],
    // A linked person also feeds the player tiles/profile (photo, club role).
    afterChange: [revalidateAfterChange(PATHS), async ({ doc, req }) => (await revalidateLinkedPlayer(req.context), doc)],
    afterDelete: [revalidateAfterDelete(PATHS), async ({ doc, req }) => (await revalidateLinkedPlayer(req.context), doc)],
  },
  timestamps: true,
  fields: [
    { name: 'name', label: 'Full name', type: 'text', required: true, admin: { placeholder: 'e.g. Sam Taylor', components: { Cell: cell('NamedPhotoCell', { imageField: 'photo' }) } } },
    {
      name: 'role',
      label: 'Job or role',
      type: 'text',
      required: true,
      admin: { description: `For example: ${ROLE_SUGGESTIONS.slice(0, 4).join(', ')}.` },
    },
    {
      name: 'section',
      label: 'Listed under',
      type: 'select',
      defaultValue: DEFAULT_SECTION,
      options: PEOPLE_SECTIONS.map((s) => ({ label: s.label, value: s.key })),
      admin: { description: 'The group they are shown with on the website.' },
    },
    {
      name: 'moreRoles',
      label: 'Other jobs',
      type: 'array',
      labels: { singular: 'Other job', plural: 'Other jobs' },
      admin: {
        initCollapsed: true,
        description: 'Another job? Add it here instead of adding them twice.',
      },
      fields: [
        { name: 'role', label: 'Job or role', type: 'text', required: true, admin: { placeholder: 'e.g. First Aid Officer' } },
        {
          name: 'section',
          label: 'Listed under',
          type: 'select',
          defaultValue: DEFAULT_SECTION,
          options: PEOPLE_SECTIONS.map((s) => ({ label: s.label, value: s.key })),
        },
      ],
    },
    { name: 'phone', label: 'Phone number', type: 'text', defaultValue: '', admin: { placeholder: 'e.g. 0400 000 000' } },
    { name: 'email', label: 'Email address', type: 'text', defaultValue: '', validate: emailOrEmpty, admin: { placeholder: 'name@example.com' } },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: `${IMAGE_HINT} Shown square, and also on their player page if they play.`,
        components: uploadPreview(),
      },
    },
    {
      name: 'player',
      label: 'Also a player',
      type: 'relationship',
      relationTo: 'players',
      index: true,
      admin: {
        description: 'Optional. Pick the player if this person also plays.',
      },
    },
    {
      ...sortOrderField(),
      label: 'Order on the page',
      admin: { step: 1, description: 'Leave as 0 unless order matters. Smaller shows first.' },
    },
  ],
}
