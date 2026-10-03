import type { CollectionConfig } from 'payload'
import { isAdminField, isStaff, isStaffField, nobodyField, staffOr } from '../access'
import { adminOnlyCondition } from '../admin/visibility'
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
    group: false,
    hideAPIURL: true,
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'source', 'hidden'],
    listSearchableFields: ['displayName', 'slug'],
    description:
      'Current players appear here by themselves every night. Add a photo, a short bio and honours to a player. To add someone from years ago, click "Add new".',
  },
  defaultSort: 'displayName',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
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
        { name: 'firstName', label: 'First name', type: 'text', required: true, validate: maxChars(100, { required: true }) },
        // Optional, as in legacy: PlayHQ players with one name are synced with lastName ''.
        { name: 'lastName', label: 'Last name', type: 'text', defaultValue: '', validate: maxChars(100) },
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
      admin: { position: 'sidebar', readOnly: true, condition: adminOnlyCondition(), description: 'Set from the name when the player is created; never changes.' },
    },
    {
      name: 'source',
      label: 'Where they came from',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'PlayHQ', value: 'playhq' },
        { label: 'Added here', value: 'manual' },
      ],
      access: syncOwned,
      hooks: { beforeChange: [playerSource] },
      admin: { position: 'sidebar', readOnly: true, description: 'PlayHQ players come in automatically and cannot be deleted.' },
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Optional. Click the button, then drop the picture in. It is shown square, so choose one where the face is in the middle.' },
    },
    {
      name: 'bio',
      label: 'About this player',
      type: 'textarea',
      defaultValue: '',
      admin: { description: 'Leave a blank line between paragraphs.', placeholder: 'A few lines about their cricket and their time at the club.' },
    },
    {
      name: 'manualYears',
      label: 'Years played',
      type: 'text',
      defaultValue: '',
      admin: {
        condition: (data) => data?.source !== 'playhq',
        description: 'For example 1978–1992. Shown when the player has no seasons recorded automatically.',
        placeholder: '1978–1992',
      },
    },
    {
      name: 'activeOverride',
      label: 'Show as',
      type: 'select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Past', value: 'past' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Leave empty and the site decides (played this season or last = current player).',
      },
    },
    {
      name: 'isActiveDerived',
      type: 'checkbox',
      defaultValue: false,
      access: syncOwned,
      hooks: { beforeChange: [keepStored(false)] },
      admin: { position: 'sidebar', readOnly: true, condition: adminOnlyCondition(), description: 'Set by the sync: played in the latest two seasons.' },
    },
    {
      name: 'hidden',
      label: 'Hide from the website',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar', description: 'Tick to keep this player off the public website.' },
    },
    {
      name: 'honours',
      type: 'array',
      labels: { singular: 'Honour', plural: 'Honours & roles' },
      admin: { description: 'Awards and roles, e.g. "Club champion". Drag to change the order.' },
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
        condition: adminOnlyCondition(),
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
        condition: adminOnlyCondition(),
        defaultColumns: ['nameKey'],
        description: 'PlayHQ names that map to this player. Merging moves them.',
      },
    },
    {
      name: 'merge',
      type: 'ui',
      admin: { condition: adminOnlyCondition(), components: { Field: '/payload/components/MergePlayerField#MergePlayerField' } },
    },
  ],
}
