import type { CollectionConfig, RequestContext } from 'payload'
import { DEFAULT_SECTION, PEOPLE_SECTIONS } from '../../lib/people'
import { anyone, isStaff } from '../access'
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
    defaultColumns: ['name', 'role', 'phone', 'email'],
    listSearchableFields: ['name', 'role'],
    description: 'Committee members, coaches and the people families can contact. They appear on the Contact and People pages.',
  },
  defaultSort: 'sortOrder',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  hooks: {
    beforeValidate: [trimStrings(['name', 'role', 'phone', 'email'])],
    // A linked person also feeds the player tiles/profile (photo, club role).
    afterChange: [revalidateAfterChange(PATHS), async ({ doc, req }) => (await revalidateLinkedPlayer(req.context), doc)],
    afterDelete: [revalidateAfterDelete(PATHS), async ({ doc, req }) => (await revalidateLinkedPlayer(req.context), doc)],
  },
  timestamps: true,
  fields: [
    { name: 'name', label: 'Full name', type: 'text', required: true, admin: { placeholder: 'e.g. Sam Taylor' } },
    {
      name: 'role',
      label: 'Job or role',
      type: 'text',
      required: true,
      admin: { description: `For example: ${ROLE_SUGGESTIONS.join(', ')}.` },
    },
    {
      name: 'section',
      label: 'Listed under',
      type: 'select',
      defaultValue: DEFAULT_SECTION,
      options: PEOPLE_SECTIONS.map((s) => ({ label: s.label, value: s.key })),
      admin: { description: 'Which group of people this person is shown with on the website.' },
    },
    { name: 'phone', label: 'Phone number', type: 'text', defaultValue: '', admin: { placeholder: 'e.g. 0400 000 000' } },
    { name: 'email', label: 'Email address', type: 'text', defaultValue: '', validate: emailOrEmpty, admin: { placeholder: 'name@example.com' } },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Optional. Click the button, then drop the picture in. It is shown square, so choose one where the face is in the middle. This is the one place to change their picture: it shows on the home page, Contact, Our People and, if they are also a player, on the Players pages.',
      },
    },
    {
      name: 'player',
      label: 'Also a player',
      type: 'relationship',
      relationTo: 'players',
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Optional. Pick the player if this person also plays. Their picture added here is then used on the Players pages whenever the player has no picture of their own, so you only ever update it in one place.',
      },
    },
    {
      ...sortOrderField(),
      label: 'Order on the page',
      admin: { step: 1, description: 'Leave as 0 unless the order matters. Smaller numbers show first (1 is at the top).' },
    },
  ],
}
