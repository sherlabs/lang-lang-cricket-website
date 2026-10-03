/** Document categories (spec §3.3): the `documents` select options and the public page's group order. */
export const DOCUMENT_CATEGORIES = ['Codes of Conduct', 'Policies', 'Child Safety', 'Game Day', 'CCCA Directory'] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]
/** Public `/documents` group order; unknown categories are appended. */
export const CATEGORY_ORDER: readonly string[] = DOCUMENT_CATEGORIES
