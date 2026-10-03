import type { CollectionConfig } from 'payload'
import { anyone, isStaff } from '../access'
import { adminOnlyCondition } from '../admin/visibility'
import { sortOrderField } from '../fields/sortOrderField'
import { clientUploadInMemory } from '../hooks/clientUploadInMemory'
import { sharedLegacyUrlField, legacyUrlWinsOnRead, maxFileSize, refuseLegacyFileReplace } from '../hooks/legacyUrl'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { sortFirst } from '../hooks/sortFirst'
import { MEDIA_MAX_BYTES } from './Media'

const PATHS = ['/gallery', '/']

/** Gallery photos (spec §3.4) ← `public.gallery_photos`. Storage prefix `gallery`. Bulk upload is Payload's native one. */
export const GalleryPhotos: CollectionConfig = {
  slug: 'gallery-photos',
  labels: { singular: 'Photo', plural: 'Photo gallery' },
  admin: {
    group: false,
    hideAPIURL: true,
    defaultColumns: ['filename', 'caption', 'createdAt'],
    listSearchableFields: ['filename', 'caption'],
    description: 'Photos on the Gallery page. New photos go to the front, and the first six also show on the home page. Use "Bulk Upload" to add lots at once.',
  },
  defaultSort: 'sortOrder',
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
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
    afterChange: [revalidateAfterChange(PATHS)],
    afterDelete: [revalidateAfterDelete(PATHS)],
  },
  timestamps: true,
  fields: [
    {
      name: 'caption',
      type: 'text',
      defaultValue: '',
      admin: { description: 'Optional. A few words about the photo.', placeholder: 'e.g. Under 14s after the semi-final' },
    },
    {
      ...sortOrderField('Lower numbers show first. Leave empty on upload to put the photo at the front.', { withDefault: false }),
      label: 'Position',
      admin: { step: 1, condition: adminOnlyCondition(), description: 'Lower numbers show first. Leave empty on upload to put the photo at the front.' },
    },
    sharedLegacyUrlField,
  ],
}
