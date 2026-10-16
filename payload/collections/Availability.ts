import type { CollectionBeforeChangeHook } from 'payload'
import { AVAILABILITY } from '../../config/site'
import { isSelectionUser } from '../access'
import { selectionCollection } from './selectionCollection'

/**
 * Who changed an answer is never taken from the request: a signed-in committee write is `selector` with `setBy` the caller; the
 * player's own write (no user, from the availability link action) is `player`.
 */
const deriveWho: CollectionBeforeChangeHook = ({ data, req }) => {
  data.respondedAt = new Date().toISOString()
  if (isSelectionUser(req.user)) {
    data.source = 'selector'
    data.setBy = req.user!.id
  } else {
    data.source = 'player'
    data.setBy = null
  }
  return data
}

/** One answer per player per fixture (announce-teams spec 4.6). Ranges and overrides are not built (deferred). */
export const Availability = selectionCollection({
  slug: 'availability',
  singular: 'Availability answer',
  plural: 'Availability answers',
  description: 'In, maybe or out for one player and one game. Managed in the selector area.',
  defaultColumns: ['player', 'fixture', 'status', 'source'],
  indexes: [{ fields: ['player', 'fixture'], unique: true }],
  hooks: { beforeChange: [deriveWho] },
  fields: [
    { name: 'player', type: 'relationship', relationTo: 'players', required: true, index: true },
    { name: 'fixture', type: 'relationship', relationTo: 'selection-fixtures', required: true, index: true },
    { name: 'status', type: 'select', required: true, options: [{ label: 'In', value: 'in' }, { label: 'Maybe', value: 'maybe' }, { label: 'Out', value: 'out' }] },
    { name: 'note', type: 'text', maxLength: AVAILABILITY.noteMax },
    { name: 'source', type: 'select', options: [{ label: 'The player', value: 'player' }, { label: 'A selector', value: 'selector' }], access: { create: () => false, update: () => false } },
    { name: 'setBy', type: 'relationship', relationTo: 'users', access: { create: () => false, update: () => false } },
    { name: 'respondedAt', type: 'date', access: { create: () => false, update: () => false } },
  ],
})
