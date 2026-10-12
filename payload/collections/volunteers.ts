import type { CollectionConfig, Field } from 'payload'
import { isStaff, nobody, nobodyField, isAdminField } from '../access'
import { noCardNumbers } from '../../lib/office/card'
import { ASSIGNMENT_STATES, AVAILABILITY_STATES, HOURS_KINDS, WEEK_STATUSES } from '../../lib/office/volunteers'
import { ledgerCollection, voidFields } from './feeLedger'

/**
 * The volunteer roster collections (wave D spec section 5). The committee (admin and editor) may read the roster; nobody writes over
 * REST or in the admin: the roster, availability and confirm actions write with the access override after their own staff check, so
 * the rules (frozen confirmed weeks, one live hours row per assignment, no card data) cannot be bypassed from a form. The one field
 * an editor does not see is `kind` on an assignment: paid status is employment information and stays with admins.
 */
const staffCollection = (c: { slug: string; singular: string; plural: string; description: string; defaultColumns: string[]; fields: Field[]; indexes?: CollectionConfig['indexes'] }): CollectionConfig => ({
  slug: c.slug,
  labels: { singular: c.singular, plural: c.plural },
  admin: { group: false, hideAPIURL: true, defaultColumns: c.defaultColumns, description: c.description },
  disableDuplicate: true,
  access: { read: isStaff, create: nobody, update: nobody, delete: nobody },
  indexes: c.indexes,
  timestamps: true,
  fields: c.fields,
})

const options = <T extends string>(values: readonly T[], labels: Record<string, string> = {}) => values.map((value) => ({ label: labels[value] ?? value, value }))

export const VolunteerWeeks = staffCollection({
  slug: 'volunteer-weeks',
  singular: 'Volunteer week',
  plural: 'Volunteer weeks',
  description: 'One game day of the volunteer roster. Managed from Club office, then Volunteers.',
  defaultColumns: ['date', 'label', 'status', 'season'],
  fields: [
    { name: 'season', label: 'Season', type: 'text', required: true, index: true },
    { name: 'date', label: 'Game day', type: 'date', required: true, unique: true, index: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'label', label: 'Label', type: 'text', maxLength: 80, validate: noCardNumbers },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'draft', index: true, options: options(WEEK_STATUSES, { draft: 'Draft', open: 'Open', confirmed: 'Confirmed' }) },
    { name: 'confirmedAt', label: 'Confirmed on', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'confirmedBy', label: 'Confirmed by', type: 'relationship', relationTo: 'users' },
  ],
})

export const VolunteerShifts = staffCollection({
  slug: 'volunteer-shifts',
  singular: 'Volunteer shift',
  plural: 'Volunteer shifts',
  description: 'A job to fill on a game day (for example the canteen). Its name is copied here so renaming a shift type never rewrites history.',
  defaultColumns: ['week', 'labelSnapshot', 'hours', 'slots'],
  fields: [
    { name: 'week', label: 'Week', type: 'relationship', relationTo: 'volunteer-weeks', required: true, index: true },
    { name: 'shiftTypeKey', label: 'Shift type code', type: 'text', required: true, index: true },
    { name: 'labelSnapshot', label: 'Name when created', type: 'text', required: true },
    { name: 'hours', label: 'Hours', type: 'number', required: true, min: 0.25, max: 24 },
    { name: 'slots', label: 'People needed', type: 'number', required: true, min: 1, max: 50 },
  ],
})

export const VolunteerAssignments = staffCollection({
  slug: 'volunteer-assignments',
  singular: 'Volunteer assignment',
  plural: 'Volunteer assignments',
  description: 'A person rostered on a shift. One row per person per shift so each has a stable id.',
  defaultColumns: ['shift', 'member', 'state', 'hours'],
  indexes: [{ fields: ['shift', 'member'], unique: true }],
  fields: [
    { name: 'shift', label: 'Shift', type: 'relationship', relationTo: 'volunteer-shifts', required: true, index: true },
    { name: 'member', label: 'Person', type: 'relationship', relationTo: 'members', required: true, index: true },
    // Paid or volunteer is employment information: only an admin reads it, only the roster actions write it.
    { name: 'kind', label: 'Paid or volunteer', type: 'select', required: true, defaultValue: 'volunteer', options: options(HOURS_KINDS, { volunteer: 'Volunteer', paid: 'Paid' }), access: { read: isAdminField, create: nobodyField, update: nobodyField } },
    { name: 'hours', label: 'Hours', type: 'number', required: true, min: 0.25, max: 24 },
    { name: 'state', label: 'State', type: 'select', required: true, defaultValue: 'rostered', index: true, options: options(ASSIGNMENT_STATES, { rostered: 'Rostered', confirmed: 'Confirmed', 'no-show': 'Did not turn up', cancelled: 'Cancelled' }) },
  ],
})

export const VolunteerAvailability = staffCollection({
  slug: 'volunteer-availability',
  singular: 'Volunteer availability',
  plural: 'Volunteer availability',
  description: 'A volunteer’s Yes, No or Maybe for a game day. Written only from their personal link or by the committee.',
  defaultColumns: ['member', 'week', 'state'],
  indexes: [{ fields: ['member', 'week'], unique: true }],
  fields: [
    { name: 'member', label: 'Person', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'week', label: 'Week', type: 'relationship', relationTo: 'volunteer-weeks', required: true, index: true },
    { name: 'state', label: 'Answer', type: 'select', required: true, options: options(AVAILABILITY_STATES, { yes: 'Yes', no: 'No', maybe: 'Maybe' }) },
    { name: 'preferredShiftKeys', label: 'Preferred jobs', type: 'text', hasMany: true },
    { name: 'note', label: 'Note', type: 'text', maxLength: 200, validate: noCardNumbers },
  ],
})

/** The hours ledger: admins only, append-only (void with a reason). The partial unique index on live rows per assignment is raw SQL in the migration. */
export const VolunteerHours = ledgerCollection({
  slug: 'volunteer-hours',
  singular: 'Volunteer hours entry',
  plural: 'Volunteer hours',
  description: 'Hours worked, from a confirmed roster week or typed in by an admin. Paid hours are kept apart from volunteer hours. A mistake is voided with a reason, not edited.',
  defaultColumns: ['member', 'date', 'hours', 'kind', 'source'],
  indexes: [{ fields: ['member', 'date'] }],
  fields: [
    { name: 'member', label: 'Person', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'date', label: 'Date', type: 'date', required: true, index: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'hours', label: 'Hours', type: 'number', required: true, min: 0.25, max: 24 },
    { name: 'kind', label: 'Paid or volunteer', type: 'select', required: true, defaultValue: 'volunteer', options: options(HOURS_KINDS, { volunteer: 'Volunteer', paid: 'Paid' }) },
    { name: 'shiftTypeKey', label: 'Shift type code', type: 'text', index: true },
    { name: 'week', label: 'Week', type: 'relationship', relationTo: 'volunteer-weeks' },
    { name: 'assignment', label: 'Assignment', type: 'relationship', relationTo: 'volunteer-assignments', admin: { description: 'At most one live row per assignment; the database enforces it.' } },
    { name: 'source', label: 'Where it came from', type: 'select', required: true, defaultValue: 'roster', options: [{ label: 'Confirmed roster week', value: 'roster' }, { label: 'Typed in', value: 'manual' }] },
    { name: 'note', label: 'Note', type: 'text', maxLength: 300, validate: noCardNumbers },
    { name: 'recordedBy', label: 'Recorded by', type: 'relationship', relationTo: 'users' },
    ...voidFields,
  ],
})
