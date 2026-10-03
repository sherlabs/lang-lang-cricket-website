import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, RequestContext } from 'payload'

/**
 * Guarded cache revalidation for collection hooks (spec §3 conventions, D16).
 * - no-op when `context.disableRevalidate` (ETL, seeds, scripts);
 * - `revalidatePath`/`revalidateTag` throw outside a Next request (e.g. `payload run`),
 *   so every call is wrapped and failures are swallowed.
 */
export async function revalidatePaths(
  paths: readonly string[],
  context?: RequestContext,
  tags: readonly string[] = [],
  opts: { layout?: boolean } = {},
): Promise<void> {
  if (context?.disableRevalidate) return
  let cache: typeof import('next/cache')
  try {
    cache = await import('next/cache')
  } catch {
    return
  }
  for (const p of paths) {
    try {
      if (opts.layout) cache.revalidatePath(p, 'layout')
      else cache.revalidatePath(p)
    } catch {
      // outside a request / static generation store: nothing to revalidate
    }
  }
  for (const t of tags) {
    try {
      cache.revalidateTag(t, 'max')
    } catch {
      // ditto
    }
  }
}

type PathsArg = readonly string[] | ((doc: Record<string, unknown>) => readonly string[])

const resolve = (paths: PathsArg, doc: Record<string, unknown>) => (typeof paths === 'function' ? paths(doc) : paths)

/** `hooks: { afterChange: [revalidateAfterChange(['/', '/sponsors'])] }` */
export const revalidateAfterChange =
  (paths: PathsArg, tags: readonly string[] = []): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, req }) => {
    const all = new Set([...resolve(paths, doc), ...(previousDoc ? resolve(paths, previousDoc) : [])])
    await revalidatePaths([...all], req.context, tags)
    return doc
  }

export const revalidateAfterDelete =
  (paths: PathsArg, tags: readonly string[] = []): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    await revalidatePaths(resolve(paths, doc), req.context, tags)
    return doc
  }
