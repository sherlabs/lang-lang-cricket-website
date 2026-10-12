import { ValidationError, type CollectionConfig } from 'payload'
import { isAdmin, isStaff, isStaffField, nobodyField } from '../access'
import { noCardNumbers } from '../../lib/office/card'
import { currentClubDate } from '../../lib/selection/club-date'
import { DEFAULT_CATEGORY_LABELS, DIARY_CATEGORIES, JOB_STATUSES, OBJECTIVE_STATUSES, validateBlockedReason } from '../../lib/office/diary'
import { isSeasonName } from '../../lib/office/season'

/**
 * The season diary and strategic plan (wave D spec section 7): annual club jobs, plan pillars and the objectives under them. These
 * are club figures, not personal data, so the committee (admin and editor) reads and edits them; only an admin deletes. A plan
 * action is simply a diary job with an objective, so there is one overdue and blocked mechanism and no second list.
 * Dates are stored as YYYY-MM-DD at noon UTC and read back with the first ten characters.
 */
const options = <T extends string>(values: readonly T[], labels: Record<string, string> = {}) => values.map((value) => ({ label: labels[value] ?? value, value }))
const access = { read: isStaff, create: isStaff, update: isStaff, delete: isAdmin }
const dayOnly = { date: { pickerAppearance: 'dayOnly' as const } }
const sourceKey = {
  name: 'sourceKey',
  label: 'Standard item code',
  type: 'text' as const,
  maxLength: 80,
  index: true,
  access: { read: isStaffField, create: nobodyField, update: nobodyField },
  admin: { readOnly: true, description: 'Set by the system for standard items, so adding them again never makes a copy.' },
}

export const PlanPillars: CollectionConfig = {
  slug: 'plan-pillars',
  labels: { singular: 'Plan pillar', plural: 'Plan pillars' },
  admin: { group: false, hideAPIURL: true, useAsTitle: 'title', defaultColumns: ['title', 'sortOrder'], description: 'A theme of your strategic plan, such as facilities or participation. Edit the plan from Club office, then Diary & plan.' },
  defaultSort: 'sortOrder',
  disableDuplicate: true,
  access,
  timestamps: true,
  fields: [
    { name: 'title', label: 'Pillar', type: 'text', required: true, maxLength: 120 },
    { name: 'summary', label: 'What it is about', type: 'textarea', maxLength: 600, validate: noCardNumbers },
    { name: 'sortOrder', label: 'Order in the plan', type: 'number', defaultValue: 100, admin: { width: '25%' } },
    sourceKey,
  ],
}

export const PlanObjectives: CollectionConfig = {
  slug: 'plan-objectives',
  labels: { singular: 'Plan objective', plural: 'Plan objectives' },
  admin: { group: false, hideAPIURL: true, useAsTitle: 'title', defaultColumns: ['title', 'pillar', 'status', 'targetDate'], description: 'What the club wants to achieve under a pillar. Jobs in the season diary are linked to an objective to show progress.' },
  defaultSort: 'sortOrder',
  disableDuplicate: true,
  access,
  timestamps: true,
  fields: [
    { name: 'pillar', label: 'Pillar', type: 'relationship', relationTo: 'plan-pillars', required: true, index: true },
    { name: 'title', label: 'Objective', type: 'text', required: true, maxLength: 160 },
    { name: 'ownerSeat', label: 'Owned by (committee seat)', type: 'relationship', relationTo: 'committee-seats', admin: { description: 'Jobs follow the seat when its holder changes.' } },
    { name: 'targetDate', label: 'Aim to finish by', type: 'date', admin: { ...dayOnly, width: '50%' } },
    { name: 'budgetCents', label: 'Budget (in cents)', type: 'number', min: 0, max: 100_000_000, admin: { description: 'Whole cents, for example 120000 for 1,200.00. Leave empty if there is none.', width: '50%' } },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      defaultValue: 'not-started',
      options: options(OBJECTIVE_STATUSES, { 'not-started': 'Not started', 'on-track': 'On track', 'at-risk': 'At risk', done: 'Done', dropped: 'Dropped' }),
    },
    { name: 'progressNote', label: 'Progress note', type: 'textarea', maxLength: 1000, validate: noCardNumbers },
    { name: 'sortOrder', label: 'Order within the pillar', type: 'number', defaultValue: 100, admin: { width: '25%' } },
    sourceKey,
  ],
}

export const DiaryJobs: CollectionConfig = {
  slug: 'diary-jobs',
  labels: { singular: 'Season diary job', plural: 'Season diary jobs' },
  admin: { group: false, hideAPIURL: true, useAsTitle: 'title', defaultColumns: ['title', 'season', 'due', 'status', 'ownerSeat'], description: 'The jobs the club does every year, with who owns them and when they are due. Work with them from Club office, then Diary & plan.' },
  defaultSort: 'due',
  disableDuplicate: true,
  access,
  timestamps: true,
  hooks: {
    // The rules live here (not only in the Diary page) because the native form is open to the committee too.
    beforeChange: [
      ({ data, originalDoc }) => {
        const merged = { ...(originalDoc ?? {}), ...data } as { status?: unknown; blockedReason?: unknown; season?: unknown }
        if (!isSeasonName(merged.season)) throw new ValidationError({ errors: [{ path: 'season', message: 'Use the season name like the rest of the site, for example 2026/27.' }] })
        const reason = validateBlockedReason(merged.status, merged.blockedReason)
        if (!reason.ok) throw new ValidationError({ errors: [{ path: 'blockedReason', message: 'A blocked job needs a short reason.' }] })
        // Finishing a job stamps the day (club time); reopening it clears the day.
        if (merged.status === 'done') {
          if (!(originalDoc as { doneOn?: unknown } | undefined)?.doneOn || (originalDoc as { status?: unknown } | undefined)?.status !== 'done') data.doneOn = `${currentClubDate()}T12:00:00.000Z`
        } else {
          data.doneOn = null
        }
        // The reason only matters while blocked.
        if (merged.status !== 'blocked') data.blockedReason = ''
        return data
      },
    ],
  },
  fields: [
    { name: 'title', label: 'Job', type: 'text', required: true, maxLength: 160 },
    { name: 'season', label: 'Season', type: 'text', required: true, index: true, maxLength: 9, admin: { description: 'The season it belongs to, written like the rest of the site, for example 2026/27.', width: '25%' } },
    { name: 'category', label: 'Group', type: 'select', required: true, defaultValue: 'other', options: options(DIARY_CATEGORIES, DEFAULT_CATEGORY_LABELS), admin: { width: '25%', description: 'The group names can be renamed in Club office settings.' } },
    { name: 'due', label: 'Due', type: 'date', index: true, admin: { ...dayOnly, width: '25%' } },
    {
      name: 'ownerSeat',
      label: 'Owned by (committee seat)',
      type: 'relationship',
      relationTo: 'committee-seats',
      index: true,
      admin: { description: 'The job follows the seat when its holder changes at the yearly meeting. A seat with nobody in it counts as having no owner.' },
    },
    { name: 'ownerPerson', label: 'Or a person', type: 'relationship', relationTo: 'people', admin: { description: 'Only if the job belongs to someone who does not hold a seat.' } },
    { name: 'budgetCents', label: 'Budget (in cents)', type: 'number', min: 0, max: 100_000_000, admin: { width: '50%', description: 'Whole cents, for example 25000 for 250.00.' } },
    { name: 'actualCents', label: 'Spent so far (in cents)', type: 'number', min: 0, max: 100_000_000, admin: { width: '50%' } },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'todo', index: true, options: options(JOB_STATUSES, { todo: 'To do', 'in-progress': 'In progress', blocked: 'Blocked', done: 'Done' }) },
    {
      name: 'blockedReason',
      label: 'Why is it blocked?',
      type: 'text',
      maxLength: 500,
      validate: (value: unknown, { siblingData }: { siblingData: { status?: unknown } }) => {
        if (siblingData?.status === 'blocked' && !(typeof value === 'string' && value.trim())) return 'Please say why this job is blocked.'
        return typeof value === 'string' ? noCardNumbers(value) : true
      },
      admin: { description: 'Required when the status is Blocked.' },
    },
    { name: 'doneOn', label: 'Finished on', type: 'date', access: { read: isStaffField, create: isStaffField, update: isStaffField }, admin: { ...dayOnly, readOnly: true, description: 'Filled in when the job is marked Done.' } },
    { name: 'objective', label: 'Plan objective', type: 'relationship', relationTo: 'plan-objectives', index: true, admin: { description: 'Link the job to an objective of the strategic plan to count it as progress.' } },
    { name: 'repeatsYearly', label: 'Repeats every season', type: 'checkbox', defaultValue: false, admin: { description: 'Jobs that repeat can be copied to the next season in one go.' } },
    { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000, validate: noCardNumbers },
    sourceKey,
  ],
}
