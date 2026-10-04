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
    { name: 'matchesUpserted', type: 'number', defaultValue: 0, admin: { description: 'Matches created or changed in the per-match store this run.' } },
    { name: 'matchesSkipped', type: 'number', defaultValue: 0, admin: { description: 'Games not stored (junior, club against club, not final).' } },
    { name: 'matchMismatches', type: 'number', defaultValue: 0, admin: { description: 'Players whose per-match totals disagree with their season totals.' } },
    { name: 'matchError', type: 'number', defaultValue: 0, admin: { description: 'Games the per-match store failed to write (the season sync still succeeded).' } },
    { name: 'error', type: 'textarea' },
  ],
}
