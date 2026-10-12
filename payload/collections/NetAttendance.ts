import { selectionCollection } from './selectionCollection'

/**
 * Someone turned up at a net session (wave B spec 4.2). It records attendance only: no rating, no form number. `playerKey` is
 * `player:<id>` or `guest:<normalised name>`, unique per session, so a double tap or two selectors checking in the same person make one
 * row. Never on a public page and never in an export.
 */
export const NetAttendance = selectionCollection({
  slug: 'net-attendance',
  singular: 'Net attendance',
  plural: 'Net attendance',
  description: 'Who turned up at a net session. Managed by the selectors, never shown publicly.',
  defaultColumns: ['session', 'playerKey', 'checkedInAt'],
  indexes: [{ fields: ['session', 'playerKey'], unique: true }],
  fields: [
    { name: 'session', type: 'relationship', relationTo: 'net-sessions', required: true, index: true },
    { name: 'playerKey', type: 'text', required: true },
    { name: 'player', type: 'relationship', relationTo: 'players', index: true },
    { name: 'guestName', type: 'text', maxLength: 40 },
    { name: 'checkedInAt', type: 'date' },
    { name: 'checkedInBy', type: 'relationship', relationTo: 'users' },
  ],
})
