/**
 * Exceptions to the committee microcopy rule (`tests/admin-microcopy.test.ts`), one entry per exact string, each with its reason.
 * The word "document" is allowed where the Documents feature itself is meant ("Documents" in the menu, "Upload a document"); the
 * test adds those by file and by collection, so only a string that really needs an exception for another reason is listed here.
 */
export type MicrocopyAllow = { where: string; text: string; reason: string }

export const MICROCOPY_ALLOW: MicrocopyAllow[] = [
]

/** Where the standalone word "document" is a real committee concept (the Documents feature), so it is not flagged. */
export const DOCUMENT_WORD_OK = {
  collections: ['documents'],
  navKeys: ['documents'],
  tileKeys: ['document'],
  /** Views about office-bearer documents (a real committee concept). */
  files: ['OfficeMeetingDocumentsView.tsx', 'OfficeMeetingsView.tsx'],
}
