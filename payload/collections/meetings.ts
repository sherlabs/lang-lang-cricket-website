import type { CollectionConfig, Field } from 'payload'
import { isAdmin, isStaff, nobody, nobodyField, isStaffField } from '../access'
import { bearerOnly, staffReadsMeetingChild, staffReadsMeetingData } from '../access/officeBearer'
import { noCardNumbers } from '../../lib/office/card'
import { ACTION_STATUSES, ATTENDANCE_STATES, DOCUMENT_CATEGORIES, ITEM_KINDS, MEETING_KINDS, MEETING_STATUSES, MINUTES_STATUSES, MOTION_RESULTS } from '../../lib/office/meetings'

/**
 * Committee meeting collections (wave D spec section 6). Minutes routinely hold finance, disciplinary or personnel matters, so the
 * restriction exists from the first migration: a meeting, an agenda item or (through its item or meeting) a motion, action or
 * attendance row can be restricted, and only an office-bearer (admin, or an editor who holds a current office-bearer seat) can read it.
 * Anyone else on the committee simply does not see the row. Nobody writes over REST or in the native admin, not even an admin: the
 * Meetings pages write with the access override after their own check, because they keep the effective-restriction copy in step.
 */
const options = <T extends string>(values: readonly T[], labels: Record<string, string> = {}) => values.map((value) => ({ label: labels[value] ?? value, value }))
const readOnlyCopy: Field = {
  name: 'effectiveRestricted',
  label: 'Restricted (worked out)',
  type: 'checkbox',
  defaultValue: false,
  required: true,
  index: true,
  access: { read: isStaffField, create: nobodyField, update: nobodyField },
  admin: { readOnly: true, description: 'Set by the system from the item and meeting. Do not change it.' },
}

const child = (c: { slug: string; singular: string; plural: string; description: string; defaultColumns: string[]; fields: Field[] }): CollectionConfig => ({
  slug: c.slug,
  labels: { singular: c.singular, plural: c.plural },
  admin: { group: false, hideAPIURL: true, defaultColumns: c.defaultColumns, description: c.description },
  disableDuplicate: true,
  access: { read: staffReadsMeetingChild, create: nobody, update: nobody, delete: nobody },
  timestamps: true,
  fields: [...c.fields, readOnlyCopy],
})

export const MeetingTemplates: CollectionConfig = {
  slug: 'meeting-templates',
  labels: { singular: 'Meeting agenda', plural: 'Meeting agendas' },
  admin: { group: false, hideAPIURL: true, useAsTitle: 'name', defaultColumns: ['name', 'kind'], description: 'The agenda a new meeting starts from. “Add the standard agendas” on the Meetings page creates generic ones to edit.' },
  disableDuplicate: true,
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isAdmin },
  timestamps: true,
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 80 },
    { name: 'kind', label: 'Kind of meeting', type: 'select', required: true, defaultValue: 'ordinary', options: options(MEETING_KINDS, { ordinary: 'Ordinary', annual: 'Yearly general meeting', special: 'Special' }), admin: { description: 'A special meeting starts restricted. A yearly general meeting gets the “Hand over seats” step.' } },
    {
      name: 'items',
      label: 'Agenda items',
      type: 'array',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 160 },
        { name: 'kind', label: 'Kind', type: 'select', required: true, defaultValue: 'general', options: options(ITEM_KINDS, { general: 'General', welcome: 'Welcome and apologies', minutes: 'Approve previous minutes', business: 'Business arising', report: 'Report', financial: 'Finance (restricted)', election: 'Election', close: 'Close' }) },
        { name: 'defaultNotes', label: 'Starting notes', type: 'textarea', maxLength: 1000, validate: noCardNumbers },
        { name: 'restricted', label: 'Restricted', type: 'checkbox', defaultValue: false, admin: { description: 'Only office-bearers see a restricted item. Finance items are always restricted.' } },
      ],
    },
  ],
}

export const Meetings: CollectionConfig = {
  slug: 'meetings',
  labels: { singular: 'Meeting', plural: 'Meetings' },
  admin: { group: false, hideAPIURL: true, useAsTitle: 'title', defaultColumns: ['title', 'startsAt', 'kind', 'status'], description: 'Committee meetings. Run them from Club office, then Meetings.' },
  defaultSort: '-startsAt',
  disableDuplicate: true,
  access: { read: staffReadsMeetingData, create: nobody, update: nobody, delete: nobody },
  timestamps: true,
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 160 },
    { name: 'kind', label: 'Kind', type: 'select', required: true, defaultValue: 'ordinary', options: options(MEETING_KINDS, { ordinary: 'Ordinary', annual: 'Yearly general meeting', special: 'Special' }) },
    { name: 'startsAt', label: 'Starts', type: 'date', required: true, index: true, admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Shown exactly as typed, with no time zone conversion.' } },
    { name: 'venue', label: 'Where', type: 'text', maxLength: 120 },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'planned', index: true, options: options(MEETING_STATUSES, { planned: 'Planned', 'in-progress': 'Under way', closed: 'Closed', cancelled: 'Cancelled' }) },
    { name: 'chairSeat', label: 'Chair', type: 'relationship', relationTo: 'committee-seats' },
    { name: 'minuteTakerSeat', label: 'Minute-taker', type: 'relationship', relationTo: 'committee-seats' },
    { name: 'restricted', label: 'Restricted', type: 'checkbox', required: true, defaultValue: false, index: true, admin: { description: 'Only office-bearers can see a restricted meeting at all.' } },
    { name: 'minutesText', label: 'Minutes', type: 'textarea', maxLength: 60000, validate: noCardNumbers },
    { name: 'minutesStatus', label: 'Minutes status', type: 'select', required: true, defaultValue: 'draft', options: options(MINUTES_STATUSES, { draft: 'Draft', approved: 'Approved' }) },
    { name: 'approvedAtMeeting', label: 'Approved at meeting', type: 'relationship', relationTo: 'meetings' },
    { name: 'closedAt', label: 'Closed on', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  ],
}

export const MeetingItems = child({
  slug: 'meeting-items',
  singular: 'Agenda item',
  plural: 'Agenda items',
  description: 'One line of a meeting’s agenda. Managed from the meeting page.',
  defaultColumns: ['meeting', 'order', 'title'],
  fields: [
    { name: 'meeting', label: 'Meeting', type: 'relationship', relationTo: 'meetings', required: true, index: true },
    { name: 'order', label: 'Order', type: 'number', required: true },
    { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 160 },
    { name: 'kind', label: 'Kind', type: 'select', required: true, defaultValue: 'general', options: options(ITEM_KINDS) },
    { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 8000, validate: noCardNumbers },
    { name: 'outcome', label: 'Outcome', type: 'textarea', maxLength: 2000, validate: noCardNumbers },
    { name: 'restricted', label: 'Restricted', type: 'checkbox', required: true, defaultValue: false },
  ],
})

export const MeetingAttendance = child({
  slug: 'meeting-attendance',
  singular: 'Attendance',
  plural: 'Attendance',
  description: 'Who came to a meeting, sent an apology or did not come.',
  defaultColumns: ['meeting', 'person', 'guestName', 'state'],
  fields: [
    { name: 'meeting', label: 'Meeting', type: 'relationship', relationTo: 'meetings', required: true, index: true },
    { name: 'person', label: 'Person', type: 'relationship', relationTo: 'people' },
    { name: 'guestName', label: 'Guest', type: 'text', maxLength: 80, validate: noCardNumbers },
    { name: 'state', label: 'State', type: 'select', required: true, defaultValue: 'present', options: options(ATTENDANCE_STATES, { present: 'Present', apology: 'Apology', absent: 'Absent' }) },
  ],
})

export const MeetingMotions = child({
  slug: 'meeting-motions',
  singular: 'Motion',
  plural: 'Motions',
  description: 'A motion put to a meeting, with vote counts. Counts only: who voted how is not kept.',
  defaultColumns: ['meeting', 'text', 'result'],
  fields: [
    { name: 'meeting', label: 'Meeting', type: 'relationship', relationTo: 'meetings', required: true, index: true },
    { name: 'item', label: 'Agenda item', type: 'relationship', relationTo: 'meeting-items', index: true },
    { name: 'text', label: 'Motion', type: 'textarea', required: true, maxLength: 600, validate: noCardNumbers },
    { name: 'votesFor', label: 'For', type: 'number', min: 0, max: 9999 },
    { name: 'votesAgainst', label: 'Against', type: 'number', min: 0, max: 9999 },
    { name: 'abstain', label: 'Abstained', type: 'number', min: 0, max: 9999 },
    { name: 'result', label: 'Result', type: 'select', options: options(MOTION_RESULTS, { carried: 'Carried', lost: 'Lost', tabled: 'Tabled', withdrawn: 'Withdrawn' }) },
  ],
})

export const MeetingActions = child({
  slug: 'meeting-actions',
  singular: 'Committee action',
  plural: 'Committee actions',
  description: 'A job agreed at a meeting, with an owner and a date. It follows the seat, not the person.',
  defaultColumns: ['text', 'ownerSeat', 'due', 'status'],
  fields: [
    { name: 'meeting', label: 'Meeting', type: 'relationship', relationTo: 'meetings', required: true, index: true },
    { name: 'item', label: 'Agenda item', type: 'relationship', relationTo: 'meeting-items', index: true },
    { name: 'text', label: 'Action', type: 'textarea', required: true, maxLength: 400, validate: noCardNumbers },
    { name: 'ownerSeat', label: 'Seat that owns it', type: 'relationship', relationTo: 'committee-seats', index: true },
    { name: 'ownerPerson', label: 'Person', type: 'relationship', relationTo: 'people' },
    { name: 'due', label: 'Due', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'open', index: true, options: options(ACTION_STATUSES, { open: 'Open', done: 'Done', blocked: 'Blocked', dropped: 'Dropped' }) },
    { name: 'doneOn', label: 'Done on', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
  ],
})

export const CommitteeDocuments: CollectionConfig = {
  slug: 'committee-documents',
  labels: { singular: 'Office-bearer document', plural: 'Office-bearer documents' },
  admin: { group: false, hideAPIURL: true, useAsTitle: 'title', defaultColumns: ['title', 'category', 'createdAt'], description: 'Files only office-bearers can open (insurance, governance, finance). Managed from Club office, then Meetings, then Documents.' },
  defaultSort: '-createdAt',
  disableDuplicate: true,
  access: { read: bearerOnly, create: bearerOnly, update: bearerOnly, delete: isAdmin },
  timestamps: true,
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 160, validate: noCardNumbers },
    { name: 'category', label: 'Category', type: 'select', required: true, defaultValue: 'other', options: options(DOCUMENT_CATEGORIES, { governance: 'Governance', finance: 'Finance', insurance: 'Insurance', legal: 'Legal', policy: 'Policy', other: 'Other' }) },
    { name: 'file', label: 'File', type: 'relationship', relationTo: 'office-files', required: true },
    { name: 'meeting', label: 'Meeting', type: 'relationship', relationTo: 'meetings' },
    { name: 'uploadedBy', label: 'Added by', type: 'relationship', relationTo: 'users', access: { read: isStaffField, create: nobodyField, update: nobodyField } },
  ],
}
