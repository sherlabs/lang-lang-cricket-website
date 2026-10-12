import { NETS } from '../../lib/nets/constants'
import { cascadeDelete } from '../hooks/cascadeDelete'
import { codeOnlyAccess, selectionCollection } from './selectionCollection'

/**
 * One training session at the nets (wave B spec 4.2). Managed in the selector area (Availability > Nets) by server actions that
 * re-derive the caller; over REST only admins and editors can read or write, like every selection collection. The timer state
 * (`round`, `roundStartedAt`, `pausedAt`, `revision`) is stored so a reload or a second selector's phone agrees; the effective round is
 * computed from these timestamps, so nothing is written when a round rolls over.
 */
export const NetSessions = selectionCollection({
  slug: 'net-sessions',
  singular: 'Net session',
  plural: 'Net sessions',
  description: 'A training session at the nets: who turned up and the rotation timer. Managed by the selectors.',
  defaultColumns: ['title', 'date', 'state'],
  useAsTitle: 'title',
  // Check-ins belong to the session; the column is NOT NULL, so deleting the session from the admin or REST removes them first.
  hooks: { beforeDelete: [cascadeDelete([{ collection: 'net-attendance', field: 'session' }])] },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 80 },
    { name: 'date', type: 'text', required: true, index: true, admin: { description: 'YYYY-MM-DD, in club time.' } },
    { name: 'startTime', type: 'text', maxLength: 8 },
    { name: 'nets', type: 'number', required: true, min: NETS.limits.nets.min, max: NETS.limits.nets.max, defaultValue: NETS.defaults.nets },
    { name: 'minutesPerTurn', type: 'number', required: true, min: NETS.limits.minutesPerTurn.min, max: NETS.limits.minutesPerTurn.max, defaultValue: NETS.defaults.minutesPerTurn },
    { name: 'groupSize', type: 'number', required: true, min: NETS.limits.groupSize.min, max: NETS.limits.groupSize.max, defaultValue: NETS.defaults.groupSize },
    { name: 'state', type: 'select', required: true, defaultValue: 'planned', index: true, options: [{ label: 'Planned', value: 'planned' }, { label: 'Running', value: 'running' }, { label: 'Paused', value: 'paused' }, { label: 'Finished', value: 'finished' }] },
    { name: 'round', type: 'number', defaultValue: 0 },
    { name: 'roundStartedAt', type: 'date' },
    { name: 'pausedAt', type: 'date' },
    { name: 'revision', type: 'number', defaultValue: 1 },
    { name: 'rotationPlan', type: 'json', access: codeOnlyAccess },
    { name: 'finishedAt', type: 'date' },
    { name: 'notes', type: 'textarea', maxLength: 500 },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
  ],
})
