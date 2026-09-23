// No 'use client' directive here on purpose: this needs to be importable
// from server code (server actions) as well as client code. `lib/blob-client.ts`
// has 'use client' at the top, so importing anything from it into a server
// module turns it into a client reference and throws at runtime — this
// module exists so `isBlobUrl` can be shared safely on both sides.
const BLOB_HOST = '.blob.vercel-storage.com'

export function isBlobUrl(url: string) {
  return url.includes(BLOB_HOST)
}
