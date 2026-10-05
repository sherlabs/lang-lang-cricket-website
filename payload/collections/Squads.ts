import type { CollectionBeforeChangeHook } from 'payload'
import { isSelectionUser } from '../access'
import { selectionCollection } from './selectionCollection'

/** One squad per grade per season (announce-teams spec 4.8). Members are separate rows so two selectors never overwrite each other. */
export const Squads = selectionCollection({
  slug: 'squads',
  singular: 'Squad',
  plural: 'Squads',
  description: 'The players in one grade for one season. Managed in the selector area.',
  defaultColumns: ['gradeName', 'seasonStartYear'],
  useAsTitle: 'gradeName',
  indexes: [{ fields: ['seasonStartYear', 'gradeId'], unique: true }],
  fields: [
    { name: 'seasonStartYear', type: 'number', required: true, index: true },
    { name: 'gradeId', type: 'text', required: true },
    { name: 'gradeName', type: 'text', required: true },
  ],
})

const deriveAdder: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  if (operation === 'create') {
    data.addedAt = new Date().toISOString()
    data.addedBy = isSelectionUser(req.user) ? req.user!.id : null
  }
  return data
}

export const SquadMembers = selectionCollection({
  slug: 'squad-members',
  singular: 'Squad member',
  plural: 'Squad members',
  description: 'One player in one squad. Managed in the selector area.',
  defaultColumns: ['squad', 'player', 'addedAt'],
  indexes: [{ fields: ['squad', 'player'], unique: true }],
  hooks: { beforeChange: [deriveAdder] },
  fields: [
    { name: 'squad', type: 'relationship', relationTo: 'squads', required: true, index: true },
    { name: 'player', type: 'relationship', relationTo: 'players', required: true, index: true },
    { name: 'addedBy', type: 'relationship', relationTo: 'users', access: { create: () => false, update: () => false } },
    { name: 'addedAt', type: 'date', access: { create: () => false, update: () => false } },
  ],
})
