/**
 * Storage options for the `office-files` collection (finance, insurance and legal files). The Vercel Blob plugin can only write
 * to a public store, so the object address is the only thing between the internet and the file: it MUST be unguessable. A random
 * suffix is added to every stored name, so `office/insurance-2026.pdf` cannot be fetched by guessing, a repeated file name can never
 * overwrite an earlier blob, and the address is never sent to a browser (client uploads off, Payload's access-controlled download
 * route on). `tests/office-blob.test.ts` fails if any of this is loosened.
 */
export const OFFICE_BLOB = {
  prefix: 'office',
  addRandomSuffix: true,
  clientUploads: false,
} as const
