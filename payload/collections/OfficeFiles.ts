import { APIError, type CollectionConfig } from 'payload'
import path from 'node:path'
import { OFFICE_FILE_MAX_BYTES, OFFICE_FILE_MIME_TYPES, OFFICE_FILE_TOO_BIG } from '../../lib/office/meetings'
import { isAdmin } from '../access'
import { bearerOnly } from '../access/officeBearer'

/**
 * Office-bearer files (wave D spec 6.5). Downloads go through Payload's own access-controlled route (`disablePayloadAccessControl:
 * false` in the storage config), so the file is served only to a signed-in office-bearer. Uploads happen on the server (never the
 * browser-direct client upload, which would hand the blob address to the uploader), so there is a 4 MB cap. Nothing public ever
 * links to these files.
 */
export const OfficeFiles: CollectionConfig = {
  slug: 'office-files',
  labels: { singular: 'Office file', plural: 'Office files' },
  admin: { group: false, hideAPIURL: true, useAsTitle: 'filename', description: 'The files behind office-bearer documents. Manage them from Club office, then Meetings, then Documents.' },
  disableDuplicate: true,
  access: { read: bearerOnly, create: bearerOnly, update: bearerOnly, delete: isAdmin },
  upload: {
    mimeTypes: OFFICE_FILE_MIME_TYPES,
    // Local development and tests only: with a Blob token the storage plugin replaces this. Kept outside any public folder.
    staticDir: path.resolve(process.cwd(), '.private', 'office-files'),
    modifyResponseHeaders: ({ headers }) => {
      const out = new Headers(headers)
      out.set('Content-Disposition', 'attachment')
      out.set('X-Content-Type-Options', 'nosniff')
      out.set('X-Robots-Tag', 'noindex, nofollow')
      out.set('Cache-Control', 'private, no-store')
      return out
    },
  },
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        const size = req.file?.size ?? (typeof data?.filesize === 'number' ? data.filesize : undefined)
        if (typeof size === 'number' && size > OFFICE_FILE_MAX_BYTES) throw new APIError(OFFICE_FILE_TOO_BIG, 400, null, true)
        return data
      },
    ],
  },
  timestamps: true,
  fields: [],
}
