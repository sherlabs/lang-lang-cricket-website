import type { CollectionConfig } from 'payload'
import { isStaff, nobody } from '../access'
import { hiddenFromEditors } from '../admin/visibility'

/** PlayHQ sync runs (spec §3.15) ← `public.player_sync_runs`. Written only by `syncPlayers`. */
export const PlayerSyncRuns: CollectionConfig = {
  slug: 'player-sync-runs',
  labels: { singular: 'Sync run', plural: 'Sync runs' },
  admin: {
    group: false,
    hideAPIURL: true,
    hidden: hiddenFromEditors,
    defaultColumns: ['startedAt', 'status', 'playersCreated', 'seasonRows', 'finishedAt'],
  },
  defaultSort: '-startedAt',
  access: { read: isStaff, create: nobody, update: nobody, delete: nobody },
  timestamps: true,
  fields: [
    { name: 'startedAt', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'finishedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'status',
      type: 'select',
      index: true,
      options: [
        { label: 'Running', value: 'running' },
        { label: 'OK', value: 'ok' },
        { label: 'Error', value: 'error' },
      ],
    },
    { name: 'playersCreated', type: 'number', defaultValue: 0 },
    { name: 'seasonRows', type: 'number', defaultValue: 0 },
    { name: 'error', type: 'textarea' },
  ],
}
