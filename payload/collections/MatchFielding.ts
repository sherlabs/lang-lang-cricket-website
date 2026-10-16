import { internalCollection, num, rel, text } from './internalCollection'

/** Match fielding (WP-M, M2): fielding statistics the scorer entered, per innings. Informational: catches are derived from dismissals. */
export const MatchFielding = internalCollection({
  slug: 'match-fielding',
  singular: 'Match fielding line',
  plural: 'Match fielding (data)',
  description: 'Fielding statistics for each stored match. Written by the PlayHQ sync. Read only.',
  defaultColumns: ['match', 'innings', 'appearanceId', 'catches'],
  indexes: [{ fields: ['innings', 'appearanceId'], unique: true }],
  fields: [
    rel('innings', 'match-innings', { required: true, index: true }),
    rel('match', 'matches', { required: true, index: true }),
    text('appearanceId', { required: true }),
    num('catches'),
    num('keeperCatches'),
    num('stumpings'),
    num('runOutsAssisted'),
    num('runOutsUnassisted'),
  ],
})
