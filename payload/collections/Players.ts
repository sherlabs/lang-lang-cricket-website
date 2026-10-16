import type { CollectionConfig } from 'payload'
import { isAdminField, isStaff, isStaffField, nobodyField, staffOr } from '../access'
import { cell, detailsGroup, filterChips, IMAGE_HINT, saveState, uploadPreview } from '../admin/formKit'
import { adminOnlyCondition } from '../admin/visibility'
import { dismissDuplicateEndpoint, mergePlayersEndpoint, undoMergeEndpoint } from '../endpoints/mergePlayers'
import { TEAMS_TAG } from '../../lib/selection/tags'
import { ALL_STATS_TAGS } from '../../lib/stats/tags'
import { maxChars } from '../fields/validators'
import { cascadeDelete } from '../hooks/cascadeDelete'
import { deletePlayerPicks } from '../hooks/deletePlayerPicks'
import { displayName, fullName } from '../hooks/displayName'
import { keepStored, playerSource, refusePlayhqDelete, unlinkPeople } from '../hooks/playerGuards'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { uniqueSlug } from '../hooks/slug'
import { trimHonours, trimStrings } from '../hooks/trimStrings'

// Hidden/name/honours changes also move the leaderboards and records, which read the stats cache tags (`ALL_STATS_TAGS`).
const STATS_PATHS = ['/stats', '/records', '/honours', '/players/compare', '/stats/opposition', '/records/partnerships']
const paths = (doc: Record<string, unknown>) =>
  doc.slug
    ? ['/players', '/teams', `/players/${doc.slug}`, `/api/public/players/${doc.slug}/card`, ...STATS_PATHS]
    : ['/players', '/teams', ...STATS_PATHS]

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
    defaultColumns: ['displayName', 'listStatus', 'games'],
    listSearchableFields: ['displayName'],
    custom: { committeeFacing: true },
    description: 'Current players appear by themselves every night. To add someone from years ago, use "Add new".',
    components: {
      ...filterChips(
        [
          {
            key: 'playing',
            label: 'Playing now',
            params: {
              'where[and][0][hidden][equals]': 'false',
              'where[and][1][or][0][activeOverride][equals]': 'active',
              'where[and][1][or][1][and][0][activeOverride][exists]': 'false',
              'where[and][1][or][1][and][1][isActiveDerived][equals]': 'true',
            },
          },
          {
            key: 'past',
            label: 'Past players',
            params: {
              'where[and][0][hidden][equals]': 'false',
              'where[and][1][or][0][activeOverride][equals]': 'past',
              'where[and][1][or][1][and][0][activeOverride][exists]': 'false',
              'where[and][1][or][1][and][1][isActiveDerived][equals]': 'false',
            },
          },
          { key: 'hidden', label: 'Hidden', params: { 'where[hidden][equals]': 'true' } },
        ],
        { label: 'Show players', allLabel: 'All players' },
      ),
      ...saveState(),
    },
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
    beforeValidate: [trimStrings(['firstName', 'lastName', 'preferredName']), trimHonours],
    beforeDelete: [
      refusePlayhqDelete,
      cascadeDelete([
        { collection: 'player-aliases', field: 'player' },
        { collection: 'player-seasons', field: 'player' },
        { collection: 'player-sponsors', field: 'player' },
        { collection: 'net-attendance', field: 'player' },
      ]),
      deletePlayerPicks,
      unlinkPeople,
    ],
    afterChange: [revalidateAfterChange(paths, [...ALL_STATS_TAGS, TEAMS_TAG])],
    afterDelete: [revalidateAfterDelete(paths, [...ALL_STATS_TAGS, TEAMS_TAG])],
  },
  endpoints: [mergePlayersEndpoint, undoMergeEndpoint, dismissDuplicateEndpoint],
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
      name: 'preferredName',
      label: 'Preferred name',
      type: 'text',
      validate: maxChars(100),
      admin: { description: 'Shown on the site instead of their PlayHQ name, such as a nickname. Optional.' },
    },
    {
      name: 'displayName',
      label: 'Name',
      type: 'text',
      access: syncOwned,
      hooks: { beforeChange: [displayName] },
      admin: { hidden: true, readOnly: true, components: { Cell: cell('NamedPhotoCell', { imageField: 'photo' }) } },
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: `${IMAGE_HINT} Shown square, so keep the face in the middle.`,
        components: uploadPreview(),
      },
    },
    {
      name: 'committeeRoles',
      label: 'Also on the committee',
      type: 'join',
      collection: 'people',
      on: 'player',
      admin: {
        allowCreate: false,
        defaultColumns: ['name', 'role'],
        description: 'If they are also on the committee, their picture is changed there.',
      },
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
        description: 'For example 1978–1992. Shown when no seasons are recorded.',
        placeholder: '1978–1992',
      },
    },
    {
      name: 'activeOverride',
      label: 'Show as',
      type: 'select',
      options: [
        { label: 'Playing now', value: 'active' },
        { label: 'Past player', value: 'past' },
      ],
      admin: {
        placeholder: 'Let the site decide',
        description: 'Leave it on "Let the site decide" unless it gets this wrong.',
      },
    },
    {
      name: 'hidden',
      label: 'Hide from the website',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { description: 'Tick to keep this player off the website.' },
    },
    {
      name: 'isJunior',
      label: 'Under 18',
      type: 'checkbox',
      defaultValue: false,
      access: { read: isStaffField, create: isStaffField, update: isStaffField },
      admin: { description: 'Under-18s stay off social media pictures unless the box below is ticked.' },
    },
    {
      name: 'socialOptIn',
      label: 'OK to post on social media',
      type: 'checkbox',
      defaultValue: false,
      access: { read: isStaffField, create: isStaffField, update: isStaffField },
      admin: { description: "Tick only with a parent or guardian's OK." },
    },
    {
      name: 'honours',
      type: 'array',
      labels: { singular: 'Honour', plural: 'Honours & roles' },
      admin: { description: 'Awards and roles, such as "Club champion". Drag to reorder.' },
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
        description: 'Optional. Totals from before 2023/24, used only for milestones. Leave at 0 if unknown.',
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
        description: 'Filled in by the nightly update.',
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
        description: 'PlayHQ names that match this player.',
      },
    },
    {
      name: 'merge',
      type: 'ui',
      admin: { condition: adminOnlyCondition(), components: { Field: '/payload/components/MergePlayerField#MergePlayerField' } },
    },
    {
      name: 'listStatus',
      type: 'ui',
      label: 'Status',
      admin: { components: { Cell: cell('PlayerStatusCell') } },
    },
    {
      name: 'games',
      type: 'ui',
      label: 'Games this season',
      admin: { components: { Cell: cell('PlayerGamesCell') } },
    },
    detailsGroup([
    {
      name: 'slug',
      label: 'Web address',
      type: 'text',
      unique: true,
      index: true,
      access: syncOwned,
      hooks: { beforeChange: [uniqueSlug('players', (d) => fullName(d.firstName, d.lastName))] },
      admin: { readOnly: true, condition: adminOnlyCondition(), description: 'Made from the name when the player is added. It never changes.' },
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
      admin: { readOnly: true, description: 'Players from PlayHQ come in by themselves and cannot be deleted.' },
    },
    {
      name: 'isActiveDerived',
      label: 'Playing now (worked out each night)',
      type: 'checkbox',
      defaultValue: false,
      access: syncOwned,
      hooks: { beforeChange: [keepStored(false)] },
      admin: { readOnly: true, condition: adminOnlyCondition(), description: 'Worked out each night: played in the latest two seasons.' },
    },
    ]),
  ],
}
