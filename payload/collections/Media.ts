import type { CollectionConfig } from 'payload'
import { isStaff, staffOr } from '../access'
import { clientUploadInMemory } from '../hooks/clientUploadInMemory'
import { legacyUrlField, legacyUrlWinsOnRead, maxFileSize, refuseLegacyFileReplace } from '../hooks/legacyUrl'

export const MEDIA_MAX_BYTES = 15 * 1024 * 1024

/**
 * Spec §3.2. Storage collection prefix is '' (payload.config.ts), so the per-row
 * `prefix` the plugin adds is stored and used verbatim.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Picture', plural: 'Media library' },
  admin: {
    group: false,
    hideAPIURL: true,
    // Not hidden: editors upload pictures from the forms that need them (logo, photo, cover).
    defaultColumns: ['filename', 'alt', 'updatedAt'],
    description: 'Every picture uploaded to the site. Normally you add pictures from the form that needs them (a sponsor logo, a contact photo, an event cover).',
  },
  // Duplicate is noise for the committee (and would copy tokens/files).
  disableDuplicate: true,
  access: {
    // Pending/rejected story images stay unlistable anonymously; not isStaff, because
    // dev-mode public pages load files through /api/media/file/* (read-checked).
    read: staffOr({
      or: [{ prefix: { not_equals: 'stories/pending' } }, { prefix: { exists: false } }],
    }),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  upload: {
    mimeTypes: ['image/*'],
    filesRequiredOnCreate: false,
    focalPoint: true,
    crop: true,
    // No resizeOptions (spec 7.6(a), WP1 findings). Crop and GIF/WebP/TIFF still go through
    // sharp, so a client upload's temp file is read into memory first (clientUploadInMemory);
    // otherwise core writes the result to the temp file only and the Vercel Blob adapter
    // re-uploads `file.data` — an EMPTY buffer — over the original.
  },
  hooks: {
    beforeOperation: [clientUploadInMemory(MEDIA_MAX_BYTES)],
    beforeValidate: [maxFileSize(MEDIA_MAX_BYTES)],
    beforeChange: [refuseLegacyFileReplace],
    afterRead: [legacyUrlWinsOnRead],
  },
  timestamps: true,
  fields: [
    {
      name: 'alt',
      label: 'Picture description',
      type: 'text',
      defaultValue: '',
      admin: { description: 'A few words for people who cannot see the picture, e.g. "Under 12s celebrating the 2024 grand final".', placeholder: 'What is in the picture?' },
    },
    legacyUrlField,
  ],
}
