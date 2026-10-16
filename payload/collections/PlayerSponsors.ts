import type { CollectionConfig, RequestContext } from 'payload'
import { revalidatePlayerProfiles } from '../../lib/players/revalidate'
import { isStaff, staffOr } from '../access'
import { cell, saveState } from '../admin/formKit'
import { sortOrderField } from '../fields/sortOrderField'
import { maxChars } from '../fields/validators'
import { revalidatePaths } from '../hooks/revalidate'
import { trimStrings } from '../hooks/trimStrings'

export const PLAYER_SPONSOR_MESSAGE_MAX = 280

async function revalidate(context: RequestContext | undefined) {
  if (context?.disableRevalidate) return
  await revalidatePaths(['/sponsors'], context)
  await revalidatePlayerProfiles()
}

/**
 * Player sponsors: a business that sponsors one player. The sponsor itself is an ordinary
 * `sponsors` row (one logo, one link, shared with the Sponsors page); this row ties it to a
 * player. Anonymous REST sees only active rows whose player is not hidden; the Local API
 * (public pages) repeats both filters in `lib/player-sponsors-queries.ts`.
 */
export const PlayerSponsors: CollectionConfig = {
  slug: 'player-sponsors',
  labels: { singular: 'Player sponsor', plural: 'Player sponsors' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'id',
    defaultColumns: ['player', 'sponsor', 'active'],
    custom: { committeeFacing: true },
    description: 'A business backing one player. Add it under Sponsors first, then link it here.',
    components: saveState(),
  },
  defaultSort: 'sortOrder',
  disableDuplicate: true,
  access: {
    read: staffOr({ and: [{ active: { equals: true } }, { 'player.hidden': { equals: false } }] }),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [trimStrings(['season', 'message'])],
    afterChange: [async ({ doc, req }) => (await revalidate(req.context), doc)],
    afterDelete: [async ({ doc, req }) => (await revalidate(req.context), doc)],
  },
  timestamps: true,
  fields: [
    {
      name: 'player',
      label: 'Player',
      type: 'relationship',
      relationTo: 'players',
      required: true,
      index: true,
      admin: { description: 'The player being sponsored.', components: { Cell: cell('RelatedCell', { collection: 'players' }) } },
    },
    {
      name: 'sponsor',
      label: 'Sponsor',
      type: 'relationship',
      relationTo: 'sponsors',
      required: true,
      index: true,
      admin: { description: 'The business. Its logo and website come from Sponsors.', components: { Cell: cell('RelatedCell', { collection: 'sponsors' }) } },
    },
    { name: 'season', label: 'Season (optional)', type: 'text', defaultValue: '', admin: { placeholder: 'e.g. 2025/26' } },
    {
      name: 'message',
      label: 'Short message (optional)',
      type: 'textarea',
      defaultValue: '',
      validate: maxChars(PLAYER_SPONSOR_MESSAGE_MAX),
      admin: { description: `A line or two, up to ${PLAYER_SPONSOR_MESSAGE_MAX} characters. For example "Proudly backing Sam since 2019".` },
    },
    {
      name: 'featured',
      label: 'Show first',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Tick to show this one first.' },
    },
    {
      ...sortOrderField(),
      label: 'Order (optional)',
      admin: { step: 1, description: 'Leave as 0. A smaller number shows earlier.' },
    },
    {
      name: 'active',
      label: 'Show on the website',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: { description: 'Switch off to hide it without deleting it.', components: { Cell: cell('OnOffCell', { on: 'Showing on the website', off: 'Hidden' }) } },
    },
  ],
}
