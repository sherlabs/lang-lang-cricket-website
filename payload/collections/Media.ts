import type { CollectionConfig } from 'payload'
import { isStaff, staffOr } from '../access'
import { legacyUrlField, legacyUrlWinsOnRead, maxFileSize, refuseLegacyFileReplace } from '../hooks/legacyUrl'

export const MEDIA_MAX_BYTES = 15 * 1024 * 1024

/**
 * Spec §3.2. Storage collection prefix is '' (payload.config.ts), so the per-row
 * `prefix` the plugin adds is stored and used verbatim.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Media',
    defaultColumns: ['filename', 'alt', 'prefix', 'updatedAt'],
  },
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
    // Spec 7.6(a): verified in WP1 that under clientUploads the plugin re-stores the
    // sharp-processed file (core drops clientUploadContext after resizing), so this caps
    // originals. Registered legacy rows carry no file and are never resized.
    resizeOptions: { width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true },
  },
  hooks: {
    beforeValidate: [maxFileSize(MEDIA_MAX_BYTES)],
    beforeChange: [refuseLegacyFileReplace],
    afterRead: [legacyUrlWinsOnRead],
  },
  timestamps: true,
  fields: [{ name: 'alt', type: 'text', defaultValue: '' }, legacyUrlField],
}
