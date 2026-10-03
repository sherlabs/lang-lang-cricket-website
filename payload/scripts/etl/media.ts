/**
 * Media import: the 3-way branch (spec §12.4, §7.4).
 *
 * | class        | rule                                              | action                                  |
 * |--------------|---------------------------------------------------|-----------------------------------------|
 * | empty        | '' / null                                         | relation null                            |
 * | own-blob     | https://<storeId>.public.blob.vercel-storage.com/… | REGISTER the existing blob (no bytes)    |
 * | local-asset  | starts with /assets/                              | UPLOAD public${url} through Payload      |
 * | other        | anything else                                     | FLAG: relation null, reported            |
 *
 * Registration never sends `url` and always sends focalX/focalY 50 (spike). A filename
 * collision in the target collection, or a documents/gallery/event-photos path outside the
 * collection prefix (it would be nested, spec §1), falls back to download + re-upload through
 * Payload — only possible with a Blob token. Without one (local rehearsal), the row is
 * registered under a disambiguated filename instead; its `legacyUrl` keeps rendering the
 * original through the read rule. Every fallback is reported.
 */
import { head } from '@vercel/blob'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import type { CollectionSlug, Payload } from 'payload'
import type { EtlReport } from './report'
import type { LegacySource } from './source'

export const ETL_CONTEXT = { etl: true, disableRevalidate: true } as const

export type EtlContext = {
  payload: Payload
  source: LegacySource
  report: EtlReport
  dryRun: boolean
  /** Update existing rows in place instead of skipping them (spec §12.3). */
  update: boolean
  /** Own Blob store id (from the token, or --blob-store-id for local/dry runs). */
  storeId: string | null
  /** The Blob token (blobToken()); undefined locally. */
  token: string | undefined
  /** Absolute path of the app's public/ directory. */
  publicDir: string
}

export type UploadCollection = 'media' | 'documents' | 'gallery-photos' | 'event-photos'

/** Storage collection prefixes (payload.config.ts). */
export const COLLECTION_PREFIX: Record<UploadCollection, string> = {
  media: '',
  documents: 'documents',
  'gallery-photos': 'gallery',
  'event-photos': 'events',
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

export function mimeFromName(name: string): string {
  return MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

export type Classified =
  | { kind: 'empty' }
  | { kind: 'own-blob'; prefix: string; filename: string; pathname: string }
  | { kind: 'local-asset'; file: string }
  | { kind: 'other' }

export function storeIdFromToken(token: string | undefined): string | null {
  return token?.match(/^vercel_blob_rw_([a-z\d]+)_/i)?.[1]?.toLowerCase() ?? null
}

export function classify(url: unknown, storeId: string | null): Classified {
  if (typeof url !== 'string' || url.trim() === '') return { kind: 'empty' }
  if (url.startsWith('/assets/')) return { kind: 'local-asset', file: decodeURIComponent(url.split(/[?#]/)[0]) }
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { kind: 'other' }
  }
  if (storeId && u.protocol === 'https:' && u.hostname === `${storeId}.public.blob.vercel-storage.com` && !u.search && !u.hash) {
    const pathname = u.pathname.replace(/^\/+/, '')
    const slash = pathname.lastIndexOf('/')
    const prefix = slash >= 0 ? pathname.slice(0, slash) : ''
    const filename = decodeURIComponent(slash >= 0 ? pathname.slice(slash + 1) : pathname)
    if (filename) return { kind: 'own-blob', prefix, filename, pathname }
  }
  return { kind: 'other' }
}

export const isUnderPrefix = (prefix: string, collectionPrefix: string) =>
  collectionPrefix === '' || prefix === collectionPrefix || prefix.startsWith(`${collectionPrefix}/`)

type Where = { step: string; table: string; id: number | string; field: string }

type FileResult = { id: number | null; action: string }

async function findOne(payload: Payload, collection: UploadCollection, field: 'legacyUrl' | 'filename', value: string) {
  const { docs } = await payload.find({
    collection: collection as CollectionSlug,
    where: { [field]: { equals: value } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (docs[0] as { id: number; legacyUrl?: string | null } | undefined) ?? null
}

/** `<prefix with / → ->-<filename>`: unique per legacy path, used only for the local (no-token) fallback. */
const disambiguate = (prefix: string, filename: string) => (prefix ? `${prefix.replace(/\//g, '-')}-${filename}` : filename)

/**
 * Write one upload doc for `url` into `collection`, with `data` merged in (the row's own
 * fields and, for id-preserving collections, `id`). Returns the doc id (null when nothing was
 * written: empty/other/missing, or a dry run).
 *
 * `relation: true` (media used as a relation) dedupes on `legacyUrl` and writes nothing for
 * an empty/other URL. `relation: false` (documents, gallery rows) always writes the row,
 * file-less when the URL cannot be imported.
 */
export async function importFile(
  ctx: EtlContext,
  opts: { collection: UploadCollection; url: unknown; data?: Record<string, unknown>; relation: boolean; where: Where },
): Promise<FileResult> {
  const { payload, report, dryRun } = ctx
  const { collection, url, relation, where } = opts
  const data = { ...(opts.data ?? {}) }
  const c = classify(url, ctx.storeId)
  const note = (kind: string, detail?: string) =>
    report.add({ step: where.step, table: where.table, id: where.id, field: where.field, url: typeof url === 'string' ? url : undefined, kind, detail })

  const create = async (args: { data: Record<string, unknown>; filePath?: string; file?: { data: Buffer; mimetype: string; name: string; size: number } }) => {
    const doc = await payload.create({
      collection: collection as CollectionSlug,
      data: args.data,
      ...(args.filePath ? { filePath: args.filePath } : {}),
      ...(args.file ? { file: args.file } : {}),
      overrideAccess: true,
      depth: 0,
      context: { ...ETL_CONTEXT },
    } as Parameters<Payload['create']>[0])
    return (doc as { id: number }).id
  }

  /** The row without a file (documents/gallery only). */
  const fileless = async (action: string): Promise<FileResult> => {
    report.mediaAction(action)
    if (relation) return { id: null, action }
    if (dryRun) return { id: null, action }
    return { id: await create({ data }), action }
  }

  if (c.kind === 'empty') return fileless('empty')
  if (c.kind === 'other') {
    note('media-flagged', 'not an own-store Blob URL or /assets/ path; relation left empty')
    return fileless('flagged')
  }

  const legacyUrl = url as string
  if (!dryRun) {
    const existing = await findOne(payload, collection, 'legacyUrl', legacyUrl)
    if (existing && relation) {
      report.mediaAction('reused')
      return { id: existing.id, action: 'reused' }
    }
    if (existing) {
      // legacyUrl is unique: a second legacy row pointing at the same file keeps its data, not the file.
      note('media-duplicate-url', `already imported as ${collection}#${existing.id}; this row is written without a file`)
      return fileless('duplicate-url')
    }
  }

  if (c.kind === 'local-asset') {
    const filePath = path.join(ctx.publicDir, c.file)
    if (!filePath.startsWith(ctx.publicDir + path.sep) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      note('media-missing', `public${c.file} does not exist; relation left empty`)
      return fileless('missing')
    }
    report.mediaAction('upload-local-asset')
    if (dryRun) return { id: null, action: 'upload-local-asset' }
    return { id: await create({ data: { ...data, legacyUrl }, filePath }), action: 'upload-local-asset' }
  }

  // own-blob
  const collectionPrefix = COLLECTION_PREFIX[collection]
  const prefixOk = isUnderPrefix(c.prefix, collectionPrefix)
  const collision = dryRun ? null : await findOne(payload, collection, 'filename', c.filename)
  let mimeType = mimeFromName(c.filename)
  let filesize: number | undefined
  if (ctx.token && !dryRun) {
    try {
      const meta = await head(legacyUrl, { token: ctx.token })
      filesize = meta.size
      if (meta.contentType) mimeType = meta.contentType
    } catch (err) {
      note('media-head-failed', (err as Error).message)
    }
  }

  if (prefixOk && !collision) {
    report.mediaAction('register')
    if (dryRun) return { id: null, action: 'register' }
    const id = await create({
      data: {
        ...data,
        filename: c.filename,
        prefix: c.prefix,
        mimeType,
        ...(filesize !== undefined ? { filesize } : {}),
        focalX: 50,
        focalY: 50,
        legacyUrl,
      },
    })
    return { id, action: 'register' }
  }

  const why = !prefixOk
    ? `path is outside the "${collectionPrefix}/" prefix (would be nested)`
    : `filename "${c.filename}" already exists in ${collection}`

  if (ctx.token) {
    note('media-fallback-reupload', `${why}; downloaded and re-uploaded through Payload (renamed)`)
    report.mediaAction('fallback-reupload')
    if (dryRun) return { id: null, action: 'fallback-reupload' }
    const res = await fetch(legacyUrl)
    if (!res.ok) {
      note('media-download-failed', `HTTP ${res.status}; relation left empty`)
      return fileless('download-failed')
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    const id = await create({
      data: { ...data, legacyUrl },
      file: { data: bytes, mimetype: mimeType, name: c.filename, size: bytes.length },
    })
    return { id, action: 'fallback-reupload' }
  }

  // No token (local rehearsal): nothing can be downloaded. Register under a unique name; the
  // legacyUrl read rule keeps the original URL on every page. A real run re-uploads instead.
  const filename = collision ? disambiguate(c.prefix, c.filename) : c.filename
  note('media-fallback-local', `${why}; registered as "${filename}" (no Blob token — a real run re-uploads)`)
  report.mediaAction('fallback-local')
  if (dryRun) return { id: null, action: 'fallback-local' }
  const id = await create({
    data: { ...data, filename, prefix: c.prefix, mimeType, focalX: 50, focalY: 50, legacyUrl },
  })
  return { id, action: 'fallback-local' }
}
