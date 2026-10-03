import type { CollectionConfig, Field } from 'payload'
import { nobody, staffOr } from '../access'

const COUNT_FIELDS = [
  'games',
  'batInnings',
  'batNotOuts',
  'batRuns',
  'batHighScore',
  'batBalls',
  'batFours',
  'batSixes',
  'bowlBalls',
  'bowlMaidens',
  'bowlRuns',
  'bowlWickets',
  'bowlBestWickets',
  'bowlBestRuns',
  'catches',
] as const

/**
 * Player seasons (spec §3.14) ← `public.player_seasons`: one row per player × PlayHQ team,
 * raw counts only. Fully rewritten by every sync (drizzle), so nothing writes it here.
 * Read: anonymous sees rows of non-hidden players only — a plain `anyone` would leak hidden
 * players' seasons through `?where[player][equals]=<id>`.
 */
export const PlayerSeasons: CollectionConfig = {
  slug: 'player-seasons',
  labels: { singular: 'Player season', plural: 'Player seasons' },
  admin: {
    group: 'Players',
    defaultColumns: ['player', 'seasonName', 'teamName', 'games', 'batRuns', 'bowlWickets'],
    description: 'Written by the PlayHQ sync; read only.',
  },
  defaultSort: 'seasonOrder',
  access: {
    read: staffOr({ 'player.hidden': { equals: false } }),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  indexes: [{ fields: ['player', 'teamId'], unique: true }],
  timestamps: true,
  fields: [
    { name: 'player', type: 'relationship', relationTo: 'players', required: true, index: true },
    { name: 'seasonName', type: 'text', required: true },
    { name: 'seasonOrder', type: 'number', required: true, index: true, admin: { description: '0 = newest senior season group.' } },
    { name: 'teamId', type: 'text', required: true },
    { name: 'teamName', type: 'text', required: true },
    { name: 'gradeName', type: 'text' },
    ...COUNT_FIELDS.map((name): Field => ({ name, type: 'number', required: true, defaultValue: 0 })),
    { name: 'batHighScoreNotOut', type: 'checkbox', defaultValue: false },
  ],
}
