import {
  APIError,
  type CollectionAfterReadHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type TextField,
} from 'payload'
import { legacyBlobStoreId } from '../env'

/**
 * `legacyUrl` on upload collections (spec §1 "legacyUrl wins on read", §7.5).
 * Set by the ETL for registered/imported legacy files; null for new uploads.
 */
export const legacyUrlField: TextField = {
  name: 'legacyUrl',
  type: 'text',
  unique: true,
  index: true,
  admin: { hidden: true },
  access: { create: () => false, update: () => false },
}

/**
 * `legacyUrl` for collections where several legacy rows may legitimately share one file
 * (documents, gallery photos): non-unique, still indexed. The first row owns the blob; each
 * later row with the same URL gets its own copy (ETL, spec §12.4) but keeps the legacy URL for
 * provenance, and the delete guard then keeps every blob of such a row until decommission.
 */
export const sharedLegacyUrlField: TextField = { ...legacyUrlField, unique: false }

const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'

/**
 * True for an https Vercel Blob URL on our own store. With a token we know the
 * store id and require it; without one (local dev on a restored dump, no Blob
 * token by design) any public Blob host is accepted — it is still a legacy row.
 * Previews are treated like the token-less case: they write to a separate
 * preview store while their (branch-restored) legacy rows point at the
 * production store, and the rule exists to keep those rendering (spec §1).
 * `legacyUrl` is ETL-only (create/update access denied), so this widens nothing
 * a user can set.
 */
export function isOwnStoreLegacyUrl(url: unknown, storeId = legacyBlobStoreId()): url is string {
  if (typeof url !== 'string' || !url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) return false
  return storeId ? parsed.hostname === `${storeId}${BLOB_HOST_SUFFIX}` : true
}

/** afterRead: a legacy own-store URL replaces the generated `url` (a no-op in prod, where they are equal). */
export const legacyUrlWinsOnRead: CollectionAfterReadHook = ({ doc }) => {
  if (doc && isOwnStoreLegacyUrl(doc.legacyUrl)) doc.url = doc.legacyUrl
  return doc
}

/**
 * beforeChange: refuse replacing the file of a row that has a `legacyUrl` until
 * decommission, so `legacyUrl` can never go stale and the plugin's old-file delete
 * never targets a blob the legacy rollback target still shows.
 */
export const refuseLegacyFileReplace: CollectionBeforeChangeHook = ({ operation, originalDoc, req, data }) => {
  if (operation !== 'update' || !originalDoc?.legacyUrl) return data
  if (process.env.LEGACY_BLOBS_RELEASED === 'yes') return data
  const replacingFile = Boolean(req.file) || (typeof data.filename === 'string' && data.filename !== originalDoc.filename)
  if (replacingFile) {
    throw new APIError('This file came from the old site and cannot be replaced yet. Upload a new image instead.', 400, null, true)
  }
  return data
}

/** beforeValidate: explicit file-size cap (the plugin sets none). Skipped for the ETL. */
export const maxFileSize =
  (bytes: number): CollectionBeforeValidateHook =>
  ({ data, req }) => {
    if (req.context?.etl === true) return data
    const size = req.file?.size ?? (typeof data?.filesize === 'number' ? data.filesize : undefined)
    if (typeof size === 'number' && size > bytes) {
      throw new APIError(`File is too large (max ${Math.round(bytes / 1024 / 1024)} MB).`, 400, null, true)
    }
    return data
  }
