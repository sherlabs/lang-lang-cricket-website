import { flag, internalCollection, num, rel, text } from './internalCollection'

/**
 * Match appearances (WP-M, M2): the only table that holds identity. Club-side rows keep a
 * `nameKey` (the same `first|last` key as `player-aliases`) and a cached `player` link; opposition
 * rows keep a display name. Child tables reference `(match, appearanceId)`, never a name.
 */
export const MatchAppearances = internalCollection({
  slug: 'match-appearances',
  singular: 'Match appearance',
  plural: 'Match appearances (data)',
  description: 'Who played in each stored match. Written by the PlayHQ sync. Read only.',
  defaultColumns: ['match', 'appearanceId', 'isClubSide', 'player'],
  indexes: [{ fields: ['match', 'appearanceId'], unique: true }, { fields: ['player', 'match'] }],
  fields: [
    rel('match', 'matches', { required: true, index: true }),
    text('appearanceId', { required: true }),
    text('teamId'),
    flag('isClubSide'),
    rel('player', 'players'),
    text('nameKey', { index: true }),
    text('displayName'),
    text('captainRole'),
    flag('isFillIn'),
    flag('isRegisteredPlayer'),
    num('playerNumber'),
  ],
})
