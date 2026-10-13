/**
 * Exceptions to the committee microcopy rule (`tests/admin-microcopy.test.ts`), one entry per exact string, each with its reason.
 * The word "document" is allowed where the Documents feature itself is meant ("Documents" in the menu, "Upload a document"); the
 * test adds those by file and by collection, so only a string that really needs an exception for another reason is listed here.
 */
export type MicrocopyAllow = { where: string; text: string; reason: string }

export const MICROCOPY_ALLOW: MicrocopyAllow[] = [
  {
    where: 'payload/components/Dashboard.tsx',
    text: 'Documents, photos, sponsors and contacts are read from the database on every visit, so saves are visible immediately.',
    reason: '"Documents" is the name of the menu entry and feature; the sentence sits in the admin-only Advanced area.',
  },
]

/** Where the standalone word "document" is a real committee concept (the Documents feature), so it is not flagged. */
export const DOCUMENT_WORD_OK = {
  collections: ['documents'],
  navKeys: ['documents'],
  tileKeys: ['document'],
}
