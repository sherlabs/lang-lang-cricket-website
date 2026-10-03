import type { CollectionConfig } from 'payload'
import { getOneTimeEventDateTime, nowAsEventClock } from '../../lib/event-occurrences'
import { isValidPaymentUrl } from '../../lib/events-meal'
import { DAYS } from '../../lib/events-format'
import { anyone, isStaff } from '../access'
import { timeOrEmpty } from '../fields/validators'
import { cascadeDelete } from '../hooks/cascadeDelete'
import { eventDates } from '../hooks/eventDates'
import { mealOptions } from '../hooks/mealOptions'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'

const paths = (doc: Record<string, unknown>) => ['/events', `/events/${doc.id}`, '/']

const isOneTime = (data: Record<string, unknown> | undefined) => (data?.type ?? 'one_time') === 'one_time'
const isRecurring = (data: Record<string, unknown> | undefined) => data?.type === 'recurring'

/** Same past-event test as `submitEventPhoto`: a one-time event whose start is before "now" (wall-clock). */
export function isPastOneTimeEvent(data: Record<string, unknown> | undefined): boolean {
  if (!data || !isOneTime(data) || !data.eventDate) return false
  const eventDate = new Date(data.eventDate as string)
  if (Number.isNaN(eventDate.getTime())) return false
  return getOneTimeEventDateTime({ eventDate, eventTime: String(data.eventTime ?? '') }) < nowAsEventClock()
}

const paymentUrl = (value: unknown, ctx?: { req?: { context?: Record<string, unknown> } }): true | string =>
  ctx?.req?.context?.etl === true || isValidPaymentUrl(typeof value === 'string' ? value : '')
    ? true
    : 'Payment link must be a full http(s) URL.'

const DATE_DISPLAY = 'EEE d MMM yyyy'

/**
 * Events (spec §3.8) ← `public.events`. Dates keep the wall-clock-as-UTC encoding (D12): the
 * `eventDates` hook snaps every date to UTC midnight of its club-timezone day; `eventTime` is
 * text `HH:mm`. RSVPs and photos hang off `event` and are deleted with it (`cascadeDelete`).
 */
export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    group: 'Events',
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'eventDate', 'startDate', 'goingCount', 'pendingCount'],
  },
  defaultSort: '-createdAt',
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  hooks: {
    beforeValidate: [eventDates],
    beforeChange: [mealOptions],
    beforeDelete: [
      cascadeDelete([
        { collection: 'event-rsvps', field: 'event' },
        { collection: 'event-photos', field: 'event' },
      ]),
    ],
    afterChange: [revalidateAfterChange(paths)],
    afterDelete: [revalidateAfterDelete(paths)],
  },
  timestamps: true,
  fields: [
    {
      name: 'type',
      type: 'radio',
      required: true,
      defaultValue: 'one_time',
      options: [
        { label: 'One-time event', value: 'one_time' },
        { label: 'Recurring (weekly)', value: 'recurring' },
      ],
      admin: { layout: 'horizontal' },
    },
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea', defaultValue: '' },
    { name: 'location', type: 'text', defaultValue: '' },
    { name: 'cover', type: 'upload', relationTo: 'media', admin: { description: 'Shown on the event card and page.' } },
    {
      name: 'eventTime',
      type: 'text',
      defaultValue: '',
      validate: timeOrEmpty,
      admin: { description: '24-hour, e.g. 18:00' },
    },
    {
      name: 'eventDate',
      type: 'date',
      admin: {
        condition: (data) => isOneTime(data),
        date: { pickerAppearance: 'dayOnly', displayFormat: DATE_DISPLAY },
        description: 'The day of the event.',
      },
    },
    {
      name: 'dayOfWeek',
      type: 'select',
      defaultValue: '4',
      options: DAYS.map((label, i) => ({ label, value: String(i) })),
      admin: { condition: (data) => isRecurring(data), description: 'Which day it runs every week.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startDate',
          type: 'date',
          admin: { condition: (data) => isRecurring(data), date: { pickerAppearance: 'dayOnly', displayFormat: DATE_DISPLAY } },
        },
        {
          name: 'endDate',
          type: 'date',
          admin: { condition: (data) => isRecurring(data), date: { pickerAppearance: 'dayOnly', displayFormat: DATE_DISPLAY } },
        },
      ],
    },
    {
      name: 'mealOptions',
      type: 'array',
      labels: { singular: 'Dinner option', plural: 'Dinner options' },
      admin: { description: 'Dinner choices offered on the RSVP form (e.g. Beef, Chicken, Veg). Leave empty for no dinner step.' },
      fields: [{ name: 'label', type: 'text', required: true }],
    },
    { name: 'paymentLinkLabel', type: 'text', defaultValue: '', admin: { description: 'e.g. "Buy tickets"' } },
    { name: 'paymentLinkUrl', type: 'text', defaultValue: '', validate: paymentUrl, admin: { description: 'A full https:// link, or empty.' } },
    {
      name: 'rsvpSummary',
      type: 'ui',
      admin: { components: { Field: '/payload/components/RsvpSummaryField#RsvpSummaryField' } },
    },
    {
      name: 'pendingPhotos',
      type: 'ui',
      admin: { components: { Field: '/payload/components/PendingPhotosField#PendingPhotosField' } },
    },
    {
      name: 'recapUpload',
      type: 'ui',
      admin: {
        condition: (data) => isPastOneTimeEvent(data),
        components: { Field: '/payload/components/RecapPhotosField#RecapPhotosField' },
      },
    },
    {
      name: 'photos',
      type: 'join',
      collection: 'event-photos',
      on: 'event',
      defaultSort: 'sortOrder',
      admin: { defaultColumns: ['filename', 'caption', 'status', 'sortOrder'] },
    },
    // RSVPs are shown by the summary above; the raw join is kept for completeness only.
    { name: 'rsvps', type: 'join', collection: 'event-rsvps', on: 'event', admin: { hidden: true } },
    {
      name: 'goingCount',
      type: 'ui',
      label: 'Going',
      admin: { components: { Cell: '/payload/components/EventCountCells#RsvpCountCell' } },
    },
    {
      name: 'pendingCount',
      type: 'ui',
      label: 'Pending photos',
      admin: { components: { Cell: '/payload/components/EventCountCells#PendingCountCell' } },
    },
  ],
}
