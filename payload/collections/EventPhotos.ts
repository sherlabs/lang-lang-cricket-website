import type { CollectionConfig } from 'payload'
import { isStaff, isStaffField, staffOr } from '../access'
import { adminOnlyCondition } from '../admin/visibility'
import { sortOrderField } from '../fields/sortOrderField'
import { maxChars } from '../fields/validators'
import { clientUploadInMemory } from '../hooks/clientUploadInMemory'
import { legacyUrlField, legacyUrlWinsOnRead, maxFileSize, refuseLegacyFileReplace } from '../hooks/legacyUrl'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { sortFirst } from '../hooks/sortFirst'
import { relId } from './EventRsvps'
import { MEDIA_MAX_BYTES } from './Media'

const paths = (doc: Record<string, unknown>) => {
  const id = relId(doc.event)
  return id ? ['/events', `/events/${id}`] : ['/events']
}

export const EVENT_PHOTO_STATUSES = ['approved', 'pending'] as const

/**
 * Event recap photos (spec §3.10) ← `public.event_photos`. Storage prefix `events`; public
 * submissions are registered with `prefix: 'events/pending'` (they stay there once approved).
 * Approve = `status: 'approved'`; reject = delete the doc, and the plugin deletes the blob
 * (unless it has a `legacyUrl`, spec §7.5). `filename` is unique per collection, so two docs
 * can never share one blob (the legacy "shared URL" guard is gone).
 */
export const EventPhotos: CollectionConfig = {
  slug: 'event-photos',
  labels: { singular: 'Event photo', plural: 'Event photos' },
  admin: {
    group: false,
    hideAPIURL: true,
    defaultColumns: ['filename', 'event', 'status', 'submitterName', 'createdAt'],
    components: { beforeList: ['/payload/components/PendingQueueBanner#PendingQueueBanner'] },
  },
  defaultSort: 'sortOrder',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
  access: {
    read: staffOr({ status: { equals: 'approved' } }),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  upload: {
    mimeTypes: ['image/*'],
    filesRequiredOnCreate: false,
    // No resizeOptions (WP1 findings, spec 7.6(a)).
  },
  hooks: {
    beforeOperation: [clientUploadInMemory(MEDIA_MAX_BYTES), sortFirst],
    beforeValidate: [maxFileSize(MEDIA_MAX_BYTES)],
    beforeChange: [refuseLegacyFileReplace],
    afterRead: [legacyUrlWinsOnRead],
    afterChange: [revalidateAfterChange(paths)],
    afterDelete: [revalidateAfterDelete(paths)],
  },
  timestamps: true,
  fields: [
    { name: 'event', label: 'Which event', type: 'relationship', relationTo: 'events', required: true, index: true },
    { name: 'caption', type: 'text', defaultValue: '', validate: maxChars(200), admin: { description: 'Optional. A few words about the photo.' } },
    {
      ...sortOrderField('Lower numbers show first. Leave empty to put the photo at the front.', { withDefault: false }),
      label: 'Position',
      admin: { step: 1, condition: adminOnlyCondition(), description: 'Lower numbers show first. Leave empty to put the photo at the front.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'approved',
      index: true,
      options: [
        { label: 'Approved (on the website)', value: 'approved' },
        { label: 'Waiting for approval', value: 'pending' },
      ],
      admin: { description: 'Only approved photos show on the event page.' },
    },
    {
      name: 'submitterName',
      type: 'text',
      defaultValue: '',
      validate: maxChars(200),
      // Never shown publicly (spec §2, A1).
      access: { read: isStaffField },
      admin: { description: 'Who sent it in from the event page. Never shown on the website.' },
    },
    legacyUrlField,
  ],
}
