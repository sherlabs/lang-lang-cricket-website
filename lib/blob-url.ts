// No 'use client' directive here on purpose: this needs to be importable
// from server code (server actions) as well as client code. `lib/blob-client.ts`
// has 'use client' at the top, so importing anything from it into a server
// module turns it into a client reference and throws at runtime — this
// module exists so `isBlobUrl` can be shared safely on both sides.
const BLOB_HOST = '.blob.vercel-storage.com'

export function isBlobUrl(url: string) {
  try {
    return new URL(url).hostname.endsWith(BLOB_HOST)
  } catch {
    return false
  }
}

/**
 * Stricter than `isBlobUrl`: also verifies the URL's host is THIS project's
 * own Blob store, not just any store matching the generic
 * `.blob.vercel-storage.com` suffix. `isBlobUrl` alone is fine for
 * admin-uploaded URLs (trusted admin session), but for an unauthenticated
 * public submission path it isn't enough — anyone can spin up their own free
 * Vercel Blob store, submit a URL from it (which also matches the generic
 * suffix), get it approved as an innocuous image, then swap the file at that
 * same URL afterward since they control that store.
 *
 * The store id is derived from `BLOB_READ_WRITE_TOKEN`, which has the shape
 * `vercel_blob_rw_<storeId>_<secret>`; the store's public hostname is
 * `<storeId>.public.blob.vercel-storage.com`.
 */
export function isOwnBlobUrl(url: string): boolean {
  const storeId = ownBlobStoreId()
  if (!storeId) return false
  try {
    // `URL#hostname` is always lowercased; the store id segment of the token
    // is mixed-case (verified against this project's actual token/store), so
    // it must be lowercased too or every legitimate submission would fail.
    return new URL(url).hostname === `${storeId.toLowerCase()}.public.blob.vercel-storage.com`
  } catch {
    return false
  }
}

function ownBlobStoreId(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? ''
  const match = token.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_/)
  return match ? match[1] : null
}
