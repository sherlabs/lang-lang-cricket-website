import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { RSVP_RESPONSE_OPTIONS } from '../../lib/rsvp-response'
import { isStaff } from '../access'
import { tokenField } from '../fields/tokenField'
import { allOf, emailOrEmpty, maxChars } from '../fields/validators'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'

/** A relationship value at any depth → its id. */
export const relId = (v: unknown): number | null =>
  typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null

const paths = (doc: Record<string, unknown>) => {
  const id = relId(doc.event)
  return id ? ['/events', `/events/${id}`] : ['/events']
}

/** Admin-side meal rule (spec §3.9): a "no" never carries a meal. Public actions run `resolveMeal` first. */
const noMealOnNo: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!data || req.context?.etl) return data
  const response = data.response ?? originalDoc?.response
  if (response === 'no') data.meal = ''
  return data
}

/**
 * Event RSVPs (spec §3.9) ← `public.event_rsvps`. Staff-only over REST; the public site
 * reads only server-side counts. `occurrenceDate` is stored verbatim (no hook): device cookie
 * keys depend on its `toISOString()` to the millisecond. No unique index on
 * (event, occurrenceDate, name): duplicates from different devices are intended.
 */
export const EventRsvps: CollectionConfig = {
  slug: 'event-rsvps',
  labels: { singular: 'RSVP', plural: 'RSVPs' },
  admin: {
    group: 'Events',
    useAsTitle: 'name',
    defaultColumns: ['name', 'event', 'occurrenceDate', 'response', 'meal'],
  },
  defaultSort: '-createdAt',
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isStaff },
  hooks: {
    beforeChange: [noMealOnNo],
    afterChange: [revalidateAfterChange(paths)],
    afterDelete: [revalidateAfterDelete(paths)],
  },
  timestamps: true,
  fields: [
    { name: 'event', type: 'relationship', relationTo: 'events', required: true, index: true },
    {
      name: 'occurrenceDate',
      type: 'date',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Which session this answer is for (club wall-clock time).',
      },
    },
    { name: 'name', type: 'text', required: true, validate: maxChars(100, { required: true }) },
    { name: 'email', type: 'text', defaultValue: '', validate: allOf(maxChars(200), emailOrEmpty) },
    { name: 'note', type: 'textarea', defaultValue: '', validate: maxChars(1000) },
    {
      name: 'response',
      type: 'select',
      defaultValue: 'yes',
      index: true,
      options: RSVP_RESPONSE_OPTIONS,
    },
    {
      name: 'meal',
      type: 'text',
      defaultValue: '',
      admin: { description: 'The dinner option chosen when the RSVP was made; empty means no dinner.' },
    },
    tokenField('editToken'),
  ],
}
