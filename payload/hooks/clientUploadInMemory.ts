import { readFile, stat } from 'node:fs/promises'
import { APIError, type CollectionBeforeOperationHook } from 'payload'

/**
 * beforeOperation on client-upload collections (WP1 finding, spec §7.6a).
 *
 * A browser-direct upload reaches the server as `getFileFromClientUpload` builds it:
 * `data` empty, the original streamed to `tempFilePath`. When core runs the file through
 * sharp (always for GIF/WebP/TIFF, and for any crop), it drops `clientUploadContext`,
 * writes the processed bytes to the temp file only, and the Vercel Blob adapter then
 * re-puts `file.data` — an empty buffer — over the original blob.
 *
 * Reading the temp file into `data` and dropping `tempFilePath` sends core down its
 * in-memory branch, where the processed bytes land in `req.file.data` and are what the
 * adapter uploads. The on-disk size is checked against the collection's cap first, so
 * nothing larger is read into memory. The temp file itself is still removed by core
 * (it tracks the path in `req.context`).
 *
 * After a re-put the storage plugin writes upload metadata back with a nested `update` on
 * the same req (`context.skipCloudStorage`). `req.query.uploadEdits` is still set there, so
 * a crop would make core re-fetch the stored (already cropped) blob and crop it again,
 * corrupting width/height. That nested update must not reprocess the file.
 */
export const clientUploadInMemory =
  (maxBytes: number): CollectionBeforeOperationHook =>
  async ({ args, operation, req }) => {
    if (operation !== 'create' && operation !== 'update') return args
    if (operation === 'update' && req.context?.skipCloudStorage && req.query?.uploadEdits) {
      delete req.query.uploadEdits
      return args
    }
    const file = req.file
    if (!file?.tempFilePath || (file.data && file.data.length > 0)) return args
    if ((await stat(file.tempFilePath)).size > maxBytes) {
      throw new APIError(`File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`, 400, null, true)
    }
    const data = await readFile(file.tempFilePath)
    req.file = { ...file, data, size: data.length, tempFilePath: undefined }
    return args
  }
