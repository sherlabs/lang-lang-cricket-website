import type { CollectionConfig } from 'payload'
import { isAdminField, isStaff, isStaffField, nobodyField, staffOr } from '../access'
import { mergePlayersEndpoint } from '../endpoints/mergePlayers'
import { maxChars } from '../fields/validators'
import { cascadeDelete } from '../hooks/cascadeDelete'
import { displayName, fullName } from '../hooks/displayName'
import { keepStored, playerSource, refusePlayhqDelete } from '../hooks/playerGuards'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { uniqueSlug } from '../hooks/slug'
import { trimHonours, trimStrings } from '../hooks/trimStrings'

// Hidden/name/honours changes also move the leaderboards and records, which read the `player-stats` cache tag.
const STATS_PATHS = ['/stats', '/records', '/honours', '/players/compare']
const STATS_TAGS = ['player-stats']
const paths = (doc: Record<string, unknown>) =>
  doc.slug
    ? ['/players', `/players/${doc.slug}`, `/api/public/players/${doc.slug}/card`, ...STATS_PATHS]
    : ['/players', ...STATS_PATHS]

/** Pre-PlayHQ totals used only by milestones (spec 3.6). Names match the `players` columns. */
export const BASELINE_FIELDS = [
  { name: 'baselineGames', label: 'Games before PlayHQ' },
  { name: 'baselineRuns', label: 'Runs before PlayHQ' },
  { name: 'baselineWickets', label: 'Wickets before PlayHQ' },
  { name: 'baselineCatches', label: 'Catches before PlayHQ' },
] as const

/** Hook- or sync-owned: read-only in the admin AND unwritable over REST (spec §2: `admin.readOnly` is UI only). */
const syncOwned = { create: nobodyField, update: nobodyField }

/**
 * Players (spec §3.12) ← `public.players` + `public.player_honours`. PlayHQ players are created
 * by the nightly sync (drizzle, `lib/players/sync.ts`); past players are added here. Sync never
 * touches the fields edited here (photo, bio, override, hidden, honours, names).
 */
export const Players: CollectionConfig = {
  slug: 'players',
  labels: { singular: 'Player', plural: 'Players' },
  admin: {
    group: 'Players',
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'source', 'hidden', 'updatedAt'],
    listSearchableFields: ['displayName', 'slug'],
    description:
      "Senior players are synced from PlayHQ every night. Add photos, bios and honours here; they're never overwritten by the sync. Create a player to add someone from before PlayHQ.",
    components: {
      beforeList: ['/payload/components/PlayerSyncPanel#PlayerSyncPanel'],
    },
  },
  defaultSort: 'displayName',
  access: {
    read: staffOr({ hidden: { equals: false } }),
    create: isStaff,
    update: isStaff,
    // The beforeDelete guard refuses PlayHQ players.
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [trimStrings(['firstName', 'lastName']), trimHonours],
    beforeDelete: [
      refusePlayhqDelete,
      cascadeDelete([
        { collection: 'player-aliases', field: 'player' },
        { collection: 'player-seasons', field: 'player' },
      ]),
    ],
    afterChange: [revalidateAfterChange(paths, STATS_TAGS)],
    afterDelete: [revalidateAfterDelete(paths, STATS_TAGS)],
  },
  endpoints: [mergePlayersEndpoint],
  timestamps: true,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'firstName', type: 'text', required: true, validate: maxChars(100, { required: true }) },
        // Optional, as in legacy: PlayHQ players with one name are synced with lastName ''.
        { name: 'lastName', type: 'text', defaultValue: '', validate: maxChars(100) },
      ],
    },
    {
      name: 'displayName',
      type: 'text',
      access: syncOwned,
      hooks: { beforeChange: [displayName] },
      admin: { hidden: true, readOnly: true },
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      access: syncOwned,
      hooks: { beforeChange: [uniqueSlug('players', (d) => fullName(d.firstName, d.lastName))] },
      admin: { position: 'sidebar', readOnly: true, description: 'Set from the name when the player is created; never changes.' },
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'PlayHQ', value: 'playhq' },
        { label: 'Added here', value: 'manual' },
      ],
      access: syncOwned,
      hooks: { beforeChange: [playerSource] },
      admin: { position: 'sidebar', readOnly: true, description: 'PlayHQ players come from the nightly sync and cannot be deleted.' },
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Shown square on the players page; use the crop tool to frame the face.' },
    },
    {
      name: 'bio',
      type: 'textarea',
      defaultValue: '',
      admin: { description: 'Plain text. Leave a blank line between paragraphs.' },
    },
    {
      name: 'manualYears',
      type: 'text',
      defaultValue: '',
      admin: {
        condition: (data) => data?.source !== 'playhq',
        description: 'Years played, e.g. 1978–1992. Shown when the player has no synced seasons.',
      },
    },
    {
      name: 'activeOverride',
      type: 'select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Past', value: 'past' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Leave empty to decide from the synced seasons (played this season or last = active).',
      },
    },
    {
      name: 'isActiveDerived',
      type: 'checkbox',
      defaultValue: false,
      access: syncOwned,
      hooks: { beforeChange: [keepStored(false)] },
      admin: { position: 'sidebar', readOnly: true, description: 'Set by the sync: played in the latest two seasons.' },
    },
    {
      name: 'hidden',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar', description: 'Hidden players are left off the public site.' },
    },
    {
      name: 'honours',
      type: 'array',
      labels: { singular: 'Honour', plural: 'Honours & roles' },
      admin: { description: 'Drag to reorder. Shown on the player page in this order.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'years', type: 'text', defaultValue: '', validate: maxChars(50), admin: { width: '30%' } },
            { name: 'title', type: 'text', required: true, validate: maxChars(200, { required: true }), admin: { width: '70%' } },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Before PlayHQ (milestones)',
      admin: {
        initCollapsed: true,
        description:
          'Optional. Games, runs, wickets and catches from before the seasons the database holds (2023/24 onwards). They are added to the stored totals for milestones only, so a long-serving player is not shown as "approaching" a milestone they passed years ago. Leave at 0 when unknown.',
      },
      fields: BASELINE_FIELDS.map(({ name, label }) => ({
        name,
        label,
        type: 'number' as const,
        defaultValue: 0,
        min: 0,
        // Admin-only to edit; staff may read it (the Local API ignores both).
        access: { read: isStaffField, create: isAdminField, update: isAdminField },
        validate: (value: unknown) =>
          value == null || (typeof value === 'number' && Number.isInteger(value) && value >= 0) ? true : 'Enter a whole number, 0 or more.',
      })),
    },
    {
      name: 'seasons',
      type: 'join',
      collection: 'player-seasons',
      on: 'player',
      defaultSort: 'seasonOrder',
      defaultLimit: 50,
      admin: {
        allowCreate: false,
        defaultColumns: ['seasonName', 'teamName', 'games', 'batRuns', 'bowlWickets', 'catches'],
        description: 'Written by the PlayHQ sync.',
      },
    },
    {
      name: 'aliases',
      type: 'join',
      collection: 'player-aliases',
      on: 'player',
      admin: {
        allowCreate: false,
        defaultColumns: ['nameKey'],
        description: 'PlayHQ names that map to this player. Merging moves them.',
      },
    },
    {
      name: 'merge',
      type: 'ui',
      admin: { components: { Field: '/payload/components/MergePlayerField#MergePlayerField' } },
    },
  ],
}
