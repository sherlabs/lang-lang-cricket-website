import type { CollectionAfterDeleteHook, Config, Plugin } from 'payload'

/**
 * Wraps a storage plugin (spec §7.5). Runs it, then diffs each collection's
 * `hooks.afterDelete` before/after and wraps only the hooks the plugin added:
 * - skip (and log) when `doc.legacyUrl` is set and LEGACY_BLOBS_RELEASED !== 'yes'
 *   (legacy blobs are shared with the rollback target until decommission);
 * - otherwise skip every delete when BLOB_DELETE_DISABLED === '1' (Preview).
 * The plugin's own afterDelete ignores `skipCloudStorage`, and the adapter is not
 * exported, so wrapping the hook is the only seam.
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
