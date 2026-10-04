import { internalCollection, num, rel, text } from './internalCollection'

/** Match batting (WP-M, M2): one row per listed batter per innings. `balls`, `fours`, `sixes` are null when the scorer did not record them. */
export const MatchBatting = internalCollection({
  slug: 'match-batting',
  singular: 'Match batting line',
  plural: 'Match batting (data)',
  description: 'Batting lines for each stored match. Written by the PlayHQ sync. Read only.',
  defaultColumns: ['match', 'innings', 'appearanceId', 'runs'],
  indexes: [{ fields: ['innings', 'appearanceId'], unique: true }],
  fields: [
    rel('innings', 'match-innings', { required: true, index: true }),
    rel('match', 'matches', { required: true, index: true }),
    text('appearanceId', { required: true }),
    num('position'),
    { name: 'battingStatus', type: 'select', options: ['out', 'not_out', 'did_not_bat', 'unknown'] },
    num('runs'),
    num('balls'),
    num('fours'),
    num('sixes'),
    {
      name: 'dismissalType',
      type: 'select',
      options: ['bowled', 'caught', 'caught_and_bowled', 'lbw', 'stumped', 'run_out', 'hit_wicket', 'retired_hurt', 'retired', 'retired_out', 'other'],
    },
    text('bowlerAppearanceId'),
    text('fielderAppearanceId'),
    num('fowWicket'),
    num('fowRuns'),
  ],
})
