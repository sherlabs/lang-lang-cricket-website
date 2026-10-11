import { nobody } from '../access'
import { codeOnlyAccess, selectionCollection } from './selectionCollection'

/**
 * One best-player ballot per voter per game (wave B spec 3.3). Nobody can read, create, update or delete a ballot over REST or in
 * the admin, not even an admin: the rows are written and counted by code (`lib/votes-queries.ts`, Local API) after its own checks.
 * `admin.hidden` does not block a direct document URL, so `read: nobody` is what stops the admin document view. The picks are
 * also code-only at field level, so a `where[picks.player]` probe cannot learn anything either. Only the PLACE of each pick is
 * stored; points are computed from the current ballot values. The admin gets an audit of WHO has voted (never for whom).
 */
export const BestPlayerBallots = selectionCollection({
  slug: 'best-player-ballots',
  singular: 'Best player ballot',
  plural: 'Best player ballots',
  description: 'Votes for the best player of a game. Private: nobody can read who voted for whom.',
  defaultColumns: ['fixture', 'source', 'castAt'],
  read: nobody,
  create: nobody,
  update: nobody,
  delete: nobody,
  indexes: [{ fields: ['fixture', 'voterKey'], unique: true }],
  fields: [
    { name: 'fixture', type: 'relationship', relationTo: 'selection-fixtures', required: true, index: true, access: codeOnlyAccess },
    { name: 'voterKey', type: 'text', required: true, access: codeOnlyAccess, admin: { description: '"player:<id>" for a player voting through the link, "selector:<userId>" for a ballot a selector entered.' } },
    { name: 'voter', type: 'relationship', relationTo: 'players', index: true, access: codeOnlyAccess },
    {
      name: 'picks',
      type: 'array',
      access: codeOnlyAccess,
      fields: [
        { name: 'place', type: 'number', required: true, min: 1, max: 5 },
        { name: 'player', type: 'relationship', relationTo: 'players', required: true },
      ],
    },
    { name: 'source', type: 'select', required: true, defaultValue: 'voter', options: [{ label: 'The voter', value: 'voter' }, { label: 'Entered by a selector', value: 'selector' }], access: codeOnlyAccess },
    { name: 'castBy', type: 'relationship', relationTo: 'users', access: codeOnlyAccess },
    { name: 'castAt', type: 'date', access: codeOnlyAccess },
    { name: 'editedAt', type: 'date', access: codeOnlyAccess },
    { name: 'revision', type: 'number', defaultValue: 1, access: codeOnlyAccess },
  ],
})
