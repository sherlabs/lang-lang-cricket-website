import type { CollectionConfig } from 'payload'
import { anyone, isStaff } from '../access'
import { sortOrderField } from '../fields/sortOrderField'
import { clientUploadInMemory } from '../hooks/clientUploadInMemory'
import { legacyUrlField, legacyUrlWinsOnRead, maxFileSize, refuseLegacyFileReplace } from '../hooks/legacyUrl'
import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidate'
import { sortFirst } from '../hooks/sortFirst'
import { MEDIA_MAX_BYTES } from './Media'

const PATHS = ['/gallery', '/']

/** Gallery photos (spec §3.4) ← `public.gallery_photos`. Storage prefix `gallery`. Bulk upload is Payload's native one. */
export const GalleryPhotos: CollectionConfig = {
  slug: 'gallery-photos',
  labels: { singular: 'Gallery photo', plural: 'Gallery photos' },
  admin: {
    group: 'Club',
    defaultColumns: ['filename', 'caption', 'sortOrder'],
    description: 'Lower sort numbers show first; the first six appear on the home page. New uploads go to the front.',
  },
  defaultSort: 'sortOrder',
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
  fields: [{ name: 'caption', type: 'text', defaultValue: '' }, sortOrderField('Lower numbers show first. Leave empty on upload to put the photo at the front.', { withDefault: false }), legacyUrlField],
}
