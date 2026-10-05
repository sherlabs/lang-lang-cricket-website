import { nobody } from '../access'
import { selectionCollection } from './selectionCollection'

/**
 * A durable copy of the club's upcoming senior games (announce-teams spec 4.3). PlayHQ is the source; `lib/selection-fixtures.ts`
 * refreshes these rows (nightly and on demand) so availability and team sheets keep a stable key through a PlayHQ outage or a
 * reschedule. Never deleted: a game PlayHQ no longer lists becomes `removed`. Written only by code.
 */
export const SelectionFixtures = selectionCollection({
  slug: 'selection-fixtures',
  singular: 'Selection fixture',
  plural: 'Selection fixtures',
  description: 'Upcoming games copied from PlayHQ for availability and team selection. Written by the site.',
  defaultColumns: ['gradeName', 'opponentName', 'localDate', 'status'],
  create: nobody,
  update: nobody,
  delete: nobody,
  fields: [
    { name: 'gameId', type: 'text', required: true, unique: true, index: true },
    { name: 'gradeId', type: 'text', required: true, index: true },
    { name: 'gradeName', type: 'text', required: true },
    { name: 'clubTeamId', type: 'text', required: true },
    { name: 'clubTeamName', type: 'text', required: true },
    { name: 'roundName', type: 'text' },
    { name: 'localDate', type: 'text', required: true, index: true },
    { name: 'localTime', type: 'text' },
    { name: 'startsAt', type: 'date' },
    { name: 'venueName', type: 'text' },
    { name: 'venueSuburb', type: 'text' },
    { name: 'opponentName', type: 'text', required: true },
    { name: 'isHome', type: 'checkbox', defaultValue: false },
    { name: 'status', type: 'select', required: true, defaultValue: 'upcoming', index: true, options: [{ label: 'Upcoming', value: 'upcoming' }, { label: 'Final', value: 'final' }, { label: 'Removed', value: 'removed' }] },
    { name: 'syncedAt', type: 'date' },
  ],
})
