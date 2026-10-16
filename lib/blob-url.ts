// No 'use client' directive and no server imports on purpose: this module is pure, so it can be
// imported from server actions AND re-exported by the 'use client' `lib/blob-client.ts`.
// Callers resolve the store id themselves (server side: `blobStoreId(blobToken())`).
/**
 * The store id inside a Blob token (`vercel_blob_rw_<storeId>_<secret>`), lower-cased:
 * `URL#hostname` is always lower-case, while the token's store id segment is mixed-case.
 */
export function blobStoreId(token: string | undefined | null): string | null {
  return token?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_/)?.[1]?.toLowerCase() ?? null
}

/** Basenames our own uploads produce (`lib/blob-client.ts` slugs them before `upload()`). */
const SAFE_BASENAME = /^[A-Za-z0-9._-]+$/

/**
 * Hardened check for a URL submitted by an anonymous visitor (spec §6). True only when it is:
 * - `https:` on exactly `<storeId>.public.blob.vercel-storage.com` — THIS project's store, not
 *   just any store (anyone can create a free Blob store, submit a URL from it, get it approved,
 *   then swap the file underneath);
 * - without query or hash, without `..` or encoded separators;
 * - directly under `prefix/` (e.g. `events/pending/`), the folder the public upload route
 *   writes to — so a crafted submission cannot point at another entity's blob (which a later
 *   reject would delete);
 * - a basename of `[A-Za-z0-9._-]+`.
 * False whenever `storeId` is unknown (no Blob token: uploads are unavailable anyway).
 */
export function isOwnBlobUrl(url: string, opts: { storeId: string | null; prefix: string }): boolean {
  const storeId = opts.storeId?.toLowerCase()
  if (!storeId || typeof url !== 'string') return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.hostname !== `${storeId}.public.blob.vercel-storage.com`) return false
  if (u.search || u.hash || url.includes('?') || url.includes('#')) return false
  if (u.username || u.password || u.port) return false
  const pathname = u.pathname.replace(/^\//, '')
  if (pathname.includes('..') || /%2f|%5c|%2e/i.test(pathname) || pathname.includes('\\')) return false
  const prefix = opts.prefix.replace(/^\/+|\/+$/g, '')
  if (!pathname.startsWith(`${prefix}/`)) return false
  const basename = pathname.slice(prefix.length + 1)
  return SAFE_BASENAME.test(basename)
}

/** `{ prefix, filename }` of a Blob URL's pathname (filename decoded). */
export function blobPathParts(url: string): { prefix: string; filename: string } {
  const pathname = new URL(url).pathname.replace(/^\//, '')
  const slash = pathname.lastIndexOf('/')
  return {
    prefix: slash >= 0 ? pathname.slice(0, slash) : '',
    filename: decodeURIComponent(slash >= 0 ? pathname.slice(slash + 1) : pathname),
  }
}
