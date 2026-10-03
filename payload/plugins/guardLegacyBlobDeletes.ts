import { Forbidden, type CollectionAfterDeleteHook, type CollectionSlug, type Config, type Endpoint, type Plugin, type Where } from 'payload'

/**
 * Wraps a storage plugin (spec §7.5). Runs it, then diffs each collection's
 * `hooks.afterDelete` before/after and wraps only the hooks the plugin added:
 * - skip (and log) when `doc.legacyUrl` is set and LEGACY_BLOBS_RELEASED !== 'yes'
 *   (legacy blobs are shared with the rollback target until decommission);
 * - otherwise skip every delete when BLOB_DELETE_DISABLED === '1' (Preview).
 * The plugin's own afterDelete ignores `skipCloudStorage`, and the adapter is not
 * exported, so wrapping the hook is the only seam.
 *
 * Also wraps the plugin's client-upload endpoint: it hands out an `allowOverwrite`
 * receipt for any existing doc at the requested path the user may update, and the
 * browser then PUTs over that blob before any collection hook (refuseLegacyFileReplace)
 * runs. An overwrite receipt for a `legacyUrl` row is refused (403) until decommission.
 */
export function guardLegacyBlobDeletes(storagePlugin: Plugin): Plugin {
  return async (incoming: Config): Promise<Config> => {
    const before = new Map<string, Set<CollectionAfterDeleteHook>>()
    for (const c of incoming.collections ?? []) before.set(c.slug, new Set(c.hooks?.afterDelete ?? []))

    const config = await storagePlugin(incoming)

    config.collections = (config.collections ?? []).map((collection) => {
      const hooks = collection.hooks?.afterDelete
      if (!hooks?.length) return collection
      const original = before.get(collection.slug) ?? new Set()
      const wrapped = hooks.map((hook) => (original.has(hook) ? hook : guardHook(hook)))
      return { ...collection, hooks: { ...collection.hooks, afterDelete: wrapped } }
    })
    config.endpoints = (config.endpoints ?? []).map((endpoint) =>
      endpoint.path?.startsWith(CLIENT_UPLOAD_PATH) ? guardClientUploadEndpoint(endpoint) : endpoint,
    )
    return config
  }
}

function guardHook(hook: CollectionAfterDeleteHook): CollectionAfterDeleteHook {
  return async (args) => {
    const { doc, req } = args
    // legacyUrl first, so a preview logs the branch production relies on (cutover checklist B.4).
    if (doc?.legacyUrl && process.env.LEGACY_BLOBS_RELEASED !== 'yes') {
      req.payload.logger.info(`[blob] legacy blob kept (shared with rollback target): ${doc.legacyUrl}`)
      return doc
    }
    if (process.env.BLOB_DELETE_DISABLED === '1') {
      req.payload.logger.info(`[blob] delete disabled (BLOB_DELETE_DISABLED=1): kept ${doc?.prefix ?? ''}/${doc?.filename ?? ''}`)
      return doc
    }
    return hook(args)
  }
}

const CLIENT_UPLOAD_PATH = '/vercel-blob-client-upload-route'

type IssuedUpload = { filename?: unknown; clientUploadContext?: { allowOverwrite?: unknown; prefix?: unknown } }

/**
 * Lets the plugin resolve the request (so its own filename/prefix sanitising applies), then
 * refuses the response when it grants an overwrite of a blob a `legacyUrl` row points at.
 */
function guardClientUploadEndpoint(endpoint: Endpoint): Endpoint {
  const handler: Endpoint['handler'] = async (req) => {
    const issuing = req.searchParams.get('issue-client-upload') === '1'
    let collectionSlug: unknown
    if (issuing && req.json) {
      const body = await req.json()
      collectionSlug = body?.collectionSlug
      req.json = async () => body
    }
    const res = await endpoint.handler(req)
    if (!issuing || res.status !== 200 || process.env.LEGACY_BLOBS_RELEASED === 'yes') return res

    const issued = (await res.clone().json()) as IssuedUpload
    if (issued.clientUploadContext?.allowOverwrite !== true) return res
    if (typeof collectionSlug !== 'string' || typeof issued.filename !== 'string') throw new Forbidden(req.t)

    const collection = req.payload.collections[collectionSlug as CollectionSlug]
    const upload = collection?.config.upload
    const sizes = upload && typeof upload === 'object' ? (upload.imageSizes ?? []) : []
    const prefix = typeof issued.clientUploadContext.prefix === 'string' ? issued.clientUploadContext.prefix : ''
    const where: Where = {
      and: [
        { legacyUrl: { exists: true } },
        { or: [{ prefix: { equals: prefix } }, ...(prefix ? [] : [{ prefix: { exists: false } }])] },
        {
          or: [
            { filename: { equals: issued.filename } },
            ...sizes.map(({ name }) => ({ [`sizes.${name}.filename`]: { equals: issued.filename } })),
          ],
        },
      ],
    }
    const { totalDocs } = await req.payload.count({ collection: collectionSlug as CollectionSlug, where, overrideAccess: true, req })
    if (totalDocs > 0) {
      req.payload.logger.warn(`[blob] refused overwrite of a legacy blob (shared with rollback target): ${prefix}/${issued.filename}`)
      throw new Forbidden(req.t)
    }
    return res
  }
  return { ...endpoint, handler }
}
