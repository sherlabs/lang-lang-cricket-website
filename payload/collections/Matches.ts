import { flag, internalCollection, num, text } from './internalCollection'

/**
 * Matches (WP-M, spec M2): one row per FINAL senior PlayHQ game, keyed by `gameId`. Written only
 * by the player sync, `pnpm backfill:matches` and the demo seed. Seasons stay the read path of
 * the stats pages; this table is the per-game record W2 builds on.
 */
export const Matches = internalCollection({
  slug: 'matches',
  singular: 'Match',
  plural: 'Matches (data)',
  description: 'One row per finished senior game, written by the PlayHQ sync. Read only.',
  defaultColumns: ['gameId', 'localDate', 'clubTeamName', 'opponentName', 'result'],
  indexes: [
    { fields: ['opponentOrgId', 'startsAt'] },
    { fields: ['seasonStartYear', 'gradeId'] },
    { fields: ['clubTeamId', 'startsAt'] },
    { fields: ['status', 'startsAt'] },
  ],
  fields: [
    text('gameId', { required: true, unique: true, index: true }),
    text('status'),
    text('type'),
    text('seasonName'),
    num('seasonStartYear'),
    text('competitionName'),
    text('gradeId'),
    text('gradeName'),
    text('roundName'),
    text('roundAbbr'),
    flag('isFinalRound'),
    { name: 'startsAt', type: 'date', index: true },
    text('localDate'),
    num('days'),
    text('venueName'),
    text('venueSuburb'),
    text('clubTeamId'),
    text('clubTeamName'),
    text('opponentTeamId'),
    text('opponentName'),
    text('opponentOrgId'),
    text('opponentOrgName'),
    flag('isHome'),
    text('tossWinnerTeamId'),
    { name: 'tossChoice', type: 'select', options: ['bat', 'bowl'] },
    flag('clubWonToss'),
    text('clubOutcome'),
    text('opponentOutcome'),
    { name: 'result', type: 'select', options: ['won', 'lost', 'draw', 'tie', 'no_result', 'abandoned'] },
    flag('byForfeit'),
    flag('onFirstInnings'),
    text('playhqUpdatedAt'),
    text('sourceHash'),
    { name: 'syncedAt', type: 'date' },
  ],
})
