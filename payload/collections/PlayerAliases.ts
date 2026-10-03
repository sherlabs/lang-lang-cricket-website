import type { CollectionConfig, FieldHook } from 'payload'

/** Hand-typed keys must match the sync's `first|last` lower-case form (§3.13). The ETL keeps values verbatim. */
const normaliseNameKey: FieldHook = ({ value, req }) =>
  req.context?.etl || typeof value !== 'string' ? value : value.trim().toLowerCase()
import { isAdmin, isStaff } from '../access'

/**
 * Player aliases (spec §3.13) ← `public.player_aliases`. PlayHQ has no stable player id: a
 * name key (`first|last`, lower-cased) maps appearances to a player. Sync and merge write it
 * directly (drizzle); the admin only repairs it by hand.
 */
export const PlayerAliases: CollectionConfig = {
  slug: 'player-aliases',
  labels: { singular: 'Player alias', plural: 'Player aliases' },
  admin: {
    group: 'Players',
    useAsTitle: 'nameKey',
    defaultColumns: ['nameKey', 'player'],
    description: 'PlayHQ name keys (first|last, lower case) and the player each one belongs to. Normally managed by sync and merge.',
  },
  access: { read: isStaff, create: isAdmin, update: isAdmin, delete: isAdmin },
  timestamps: true,
  fields: [
    { name: 'nameKey', type: 'text', required: true, unique: true, index: true, hooks: { beforeValidate: [normaliseNameKey] } },
    { name: 'player', type: 'relationship', relationTo: 'players', required: true, index: true },
  ],
}
