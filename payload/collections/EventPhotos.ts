import type { CollectionConfig } from 'payload'
import { isStaff, isStaffField, staffOr } from '../access'
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
    group: 'Events',
    defaultColumns: ['filename', 'event', 'status', 'submitterName', 'createdAt'],
    components: { beforeList: ['/payload/components/PendingQueueBanner#PendingQueueBanner'] },
  },
  defaultSort: 'sortOrder',
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
    { name: 'event', type: 'relationship', relationTo: 'events', required: true, index: true },
    { name: 'caption', type: 'text', defaultValue: '', validate: maxChars(200) },
    sortOrderField('Lower numbers show first. Leave empty to put the photo at the front.', { withDefault: false }),
    {
      name: 'status',
      type: 'select',
      defaultValue: 'approved',
      index: true,
      options: [
        { label: 'Approved (public)', value: 'approved' },
        { label: 'Pending review', value: 'pending' },
      ],
    },
    {
      name: 'submitterName',
      type: 'text',
      defaultValue: '',
      validate: maxChars(200),
      // Never shown publicly (spec §2, A1).
      access: { read: isStaffField },
      admin: { description: 'Who sent it in from the event page (admin context only).' },
    },
    legacyUrlField,
  ],
}
