import { internalCollection, num, rel, text } from './internalCollection'

/** Match bowling (WP-M, M2): one row per bowler with at least one ball bowled, per innings. `balls` is overs converted to balls. */
export const MatchBowling = internalCollection({
  slug: 'match-bowling',
  singular: 'Match bowling line',
  plural: 'Match bowling (data)',
  description: 'Bowling figures for each stored match. Written by the PlayHQ sync. Read only.',
  defaultColumns: ['match', 'innings', 'appearanceId', 'wickets'],
  indexes: [{ fields: ['innings', 'appearanceId'], unique: true }],
  fields: [
    rel('innings', 'match-innings', { required: true, index: true }),
    rel('match', 'matches', { required: true, index: true }),
    text('appearanceId', { required: true }),
    num('order'),
    num('balls'),
    num('maidens'),
    num('runs'),
    num('wickets'),
    num('wides'),
    num('noBalls'),
  ],
})
