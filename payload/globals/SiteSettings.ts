import type { Field, GlobalConfig } from 'payload'
import { TIER_ORDER } from '../../lib/sponsors'
import {
  DEFAULT_APPROACH_WINDOW,
  DEFAULT_INCLUDED_CATEGORIES,
  DEFAULT_MILESTONE_THRESHOLDS,
  DEFAULT_SPONSOR_CAROUSEL_TIERS,
} from '../../lib/site-settings-core'
import { DEFAULT_MATCH_MINIMUMS, MATCH_MINIMUM_LABELS, type MatchMinimums } from '../../lib/stats/match/minimums'
import { DEFAULT_QUALIFICATION } from '../../lib/stats/qualify'
import { CATEGORY_LABELS, GRADE_CATEGORIES, validateRulePattern } from '../../lib/stats/categories'
import { anyone, isStaff } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { ALL_STATS_TAGS } from '../../lib/stats/tags'
import { revalidatePaths } from '../hooks/revalidate'


const num = (name: string, defaultValue: number, label?: string): Field => ({
  name,
  label,
  type: 'number',
  min: 0,
  defaultValue,
  admin: { step: 1 },
})

const qualScope = (name: 'career' | 'season', label: string): Field => {
  const d = DEFAULT_QUALIFICATION[name]
  return {
    name,
    label,
    type: 'group',
    fields: [
      { type: 'row', fields: [num('batAvgRuns', d.batAvgRuns, 'Batting average: min runs'), num('batAvgInnings', d.batAvgInnings, 'Batting average: min innings')] },
      { type: 'row', fields: [num('srBalls', d.srBalls, 'Strike rate: min balls faced'), num('bowlAvgWickets', d.bowlAvgWickets, 'Bowling average: min wickets')] },
      { type: 'row', fields: [num('econBalls', d.econBalls, 'Economy: min balls bowled')] },
    ],
  }
}

const milestoneNumbers = (name: 'games' | 'runs' | 'wickets' | 'catches'): Field => ({
  name,
  type: 'number',
  hasMany: true,
  min: 1,
  defaultValue: [...DEFAULT_MILESTONE_THRESHOLDS[name]],
})

/** Stats configuration (spec 3.2, 3.3, 3.6). Read through `getStatsSettings()`, which falls back to defaults per field. */
const statsGroup: Field = {
  name: 'stats',
  type: 'group',
  label: 'Stats and leaderboards',
  fields: [
    {
      name: 'defaultIncludedCategories',
      label: 'Categories shown by default',
      type: 'select',
      hasMany: true,
      options: GRADE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
      defaultValue: [...DEFAULT_INCLUDED_CATEGORIES],
      admin: { description: 'Visitors can add juniors with the toggle. Categories with no data are not offered.' },
    },
    {
      name: 'gradeRules',
      label: 'Grade rules',
      type: 'array',
      admin: { description: 'Extra patterns that decide a grade category. They are tried before the built-in rules, in order.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'category', type: 'select', required: true, options: GRADE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })), admin: { width: '25%' } },
            {
              name: 'pattern',
              type: 'text',
              required: true,
              maxLength: 100,
              validate: (value: unknown, { siblingData }: { siblingData?: unknown }) =>
                validateRulePattern(value, (siblingData as { flags?: unknown } | undefined)?.flags) ?? true,
              admin: { width: '55%', description: 'A regular expression tested against the grade name, then the team name.' },
            },
            { name: 'flags', type: 'text', defaultValue: 'i', maxLength: 4, admin: { width: '20%' } },
          ],
        },
      ],
    },
    {
      name: 'labelRenames',
      label: 'Grade and team names',
      type: 'array',
      maxRows: 200,
      admin: { description: 'Show one name for a grade or team everywhere (leaderboards, records, StatLab, yearbooks). The data from PlayHQ is not changed, so this survives every update. Do not chain renames (A to B, then B to C).' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'kind', type: 'select', required: true, defaultValue: 'grade', admin: { width: '20%' },
              options: [{ label: 'Grade', value: 'grade' }, { label: 'Team', value: 'team' }, { label: 'Opposition (advanced)', value: 'opponent' }],
            },
            { name: 'from', label: 'From (as in the data)', type: 'text', required: true, maxLength: 120, admin: { width: '40%' } },
            { name: 'to', label: 'Show as', type: 'text', required: true, maxLength: 120, admin: { width: '40%' } },
          ],
        },
      ],
    },
    {
      name: 'labelRenamesHelp',
      type: 'ui',
      admin: { components: { Field: '/payload/components/LabelRenamesHelp#LabelRenamesHelp' } },
    },
    {
      name: 'qualification',
      label: 'Qualification minimums',
      type: 'group',
      admin: { description: 'Players below a minimum are listed under "Not enough data yet" and never ranked.' },
      fields: [qualScope('career', 'Since the first stored season'), qualScope('season', 'Single season')],
    },
    {
      name: 'matchMinimums',
      label: 'Match-data minimums',
      type: 'group',
      admin: { description: 'How much match data a rate needs before it is shown (otherwise the page shows the counts and a dash). Used by the match analysis on profiles, opposition and leaderboards.' },
      fields: (Object.keys(DEFAULT_MATCH_MINIMUMS) as (keyof MatchMinimums)[]).map((k) => num(k, DEFAULT_MATCH_MINIMUMS[k], MATCH_MINIMUM_LABELS[k])),
    },
    {
      name: 'milestoneThresholds',
      label: 'Milestone thresholds',
      type: 'group',
      fields: [milestoneNumbers('games'), milestoneNumbers('runs'), milestoneNumbers('wickets'), milestoneNumbers('catches')],
    },
    {
      name: 'approachWindow',
      label: 'Approaching a milestone within',
      type: 'group',
      fields: [
        { type: 'row', fields: (['games', 'runs', 'wickets', 'catches'] as const).map((k) => num(k, DEFAULT_APPROACH_WINDOW[k])) },
      ],
    },
    {
      name: 'honourCategories',
      label: 'Honour categories',
      type: 'array',
      admin: { description: 'Groups on the honour board. An honour is placed in the first category whose keyword it contains; anything else is "Other". Leave empty for the defaults.' },
      fields: [
        { name: 'label', type: 'text', required: true, maxLength: 60 },
        { name: 'keywords', type: 'text', hasMany: true, required: true },
      ],
    },
  ],
}

/** Site behaviour (spec §4.2). Feature flags are deferred to the template work. */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  admin: { group: false, hidden: hiddenFromEditors },
  access: { read: anyone, update: isStaff },
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        // Stats settings change classification, thresholds and milestones: refresh the stats pages too.
        await revalidatePaths(['/', '/sponsors', '/stats', '/records', '/players', '/stats/opposition', '/records/partnerships'], req.context, ALL_STATS_TAGS)
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Site',
          fields: [
            {
              name: 'sponsorCarouselTiers',
              label: 'Sponsor carousel tiers',
              type: 'select',
              hasMany: true,
              options: [...TIER_ORDER],
              defaultValue: [...DEFAULT_SPONSOR_CAROUSEL_TIERS],
              admin: {
                description: 'Sponsors in these tiers scroll across the home page under the hero. Leave empty to hide the carousel.',
              },
            },
          ],
        },
        { label: 'Stats', fields: [statsGroup] },
      ],
    },
  ],
}
