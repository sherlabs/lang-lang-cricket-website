import { internalCollection, num, rel, text } from './internalCollection'

/**
 * Merge log (W2 spec 6.2, issue #10): one row per player merge (so it can be undone) and per "not the same person"
 * decision (so a dismissed pair is not suggested again). Written by code only, hidden from every role in the admin;
 * the duplicates view reads it with `overrideAccess`. The snapshot holds identity only (the source player row, alias
 * and honour ids, link ids): season rows and appearances are rebuilt by the next sync, so nothing stale is restored.
 */
export const MergeLog = internalCollection({
  slug: 'merge-log',
  singular: 'Merge log entry',
  plural: 'Merge log (data)',
  description: 'Player merges that can be undone, and pairs marked as different people. Written by the site; read only.',
  defaultColumns: ['kind', 'status', 'sourceName', 'targetPlayer', 'createdAt'],
  fields: [
    { name: 'kind', type: 'select', required: true, index: true, options: ['merge', 'dismissed'] },
    { name: 'status', type: 'select', required: true, index: true, options: ['applied', 'undone', 'dismissed'] },
    num('sourcePlayerId', { required: true, index: true }),
    text('sourceName'),
    // The player it was merged into (or, for a dismissed pair, the other player). Set null when that player is deleted.
    rel('targetPlayer', 'players'),
    { name: 'snapshot', type: 'json' },
    rel('createdBy', 'users'),
    { name: 'undoneAt', type: 'date' },
    rel('undoneBy', 'users'),
  ],
})
