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
  labels: { singular: 'Event', plural: 'Events' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'title',
    defaultColumns: ['title', 'eventDate', 'goingCount', 'pendingCount'],
    listSearchableFields: ['title', 'location'],
    description: 'Dinners, working bees and presentation days. People can RSVP from the event page on the website.',
  },
  defaultSort: '-createdAt',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
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
      label: 'How often does it happen?',
      type: 'radio',
      required: true,
      defaultValue: 'one_time',
      options: [
        { label: 'Once (on one day)', value: 'one_time' },
        { label: 'Every week', value: 'recurring' },
      ],
      admin: { layout: 'horizontal' },
    },
    { name: 'title', label: 'Event name', type: 'text', required: true, admin: { placeholder: 'e.g. Season presentation night' } },
    {
      name: 'eventDate',
      label: 'Date',
      type: 'date',
      admin: {
        condition: (data) => isOneTime(data),
        date: { pickerAppearance: 'dayOnly', displayFormat: DATE_DISPLAY },
        description: 'The day of the event.',
        placeholder: 'Pick the day',
      },
    },
    {
      name: 'dayOfWeek',
      label: 'Which day each week?',
      type: 'select',
      defaultValue: '4',
      options: DAYS.map((label, i) => ({ label, value: String(i) })),
      admin: { condition: (data) => isRecurring(data) },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startDate',
          label: 'First week',
          type: 'date',
          admin: { condition: (data) => isRecurring(data), date: { pickerAppearance: 'dayOnly', displayFormat: DATE_DISPLAY }, placeholder: 'Pick the day' },
        },
        {
          name: 'endDate',
          label: 'Last week',
          type: 'date',
          admin: { condition: (data) => isRecurring(data), date: { pickerAppearance: 'dayOnly', displayFormat: DATE_DISPLAY }, placeholder: 'Pick the day' },
        },
      ],
    },
    {
      name: 'eventTime',
      label: 'Start time',
      type: 'text',
      defaultValue: '',
      validate: timeOrEmpty,
      admin: { description: 'Type the time using the 24-hour clock, for example 18:00 for 6pm.', placeholder: '18:00' },
    },
    { name: 'location', label: 'Where', type: 'text', defaultValue: '', admin: { placeholder: 'e.g. Lang Lang Recreation Reserve' } },
    {
      name: 'description',
      label: 'What is happening',
      type: 'textarea',
      defaultValue: '',
      admin: { description: 'A few lines for people deciding whether to come.', placeholder: 'Tell people what to expect, what to bring and who it is for.' },
    },
    {
      name: 'cover',
      label: 'Picture (optional)',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Shown on the event card and page. Click the button, then drop the picture in.' },
    },
    {
      type: 'collapsible',
      label: 'Dinner and tickets (optional)',
      admin: { initCollapsed: true, description: 'Only needed if people choose a meal or pay online.' },
      fields: [
        {
          name: 'mealOptions',
          label: 'Dinner choices',
          type: 'array',
          labels: { singular: 'Dinner choice', plural: 'Dinner choices' },
          admin: { description: 'The meals people can pick when they RSVP (e.g. Beef, Chicken, Veg). Leave empty if there is no dinner.' },
          fields: [{ name: 'label', label: 'Meal', type: 'text', required: true }],
        },
        { name: 'paymentLinkLabel', label: 'Payment button wording', type: 'text', defaultValue: '', admin: { placeholder: 'e.g. Buy tickets' } },
        {
          name: 'paymentLinkUrl',
          label: 'Payment link',
          type: 'text',
          defaultValue: '',
          validate: paymentUrl,
          admin: { description: 'Where people pay, starting with https://. Leave empty if there is nothing to pay.', placeholder: 'https://' },
        },
      ],
    },
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
      label: 'Event photos',
      type: 'join',
      collection: 'event-photos',
      on: 'event',
      defaultSort: 'sortOrder',
      admin: { defaultColumns: ['filename', 'caption', 'status'] },
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
      label: 'Photos to approve',
      admin: { components: { Cell: '/payload/components/EventCountCells#PendingCountCell' } },
    },
  ],
}
