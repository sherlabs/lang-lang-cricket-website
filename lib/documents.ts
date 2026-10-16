/** Document categories (spec §3.3): the `documents` select options and the public page's group order. */
export const DOCUMENT_CATEGORIES = ['Codes of Conduct', 'Policies', 'Child Safety', 'Game Day', 'Association directory'] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]
/** Public `/documents` group order; unknown categories are appended. */
export const CATEGORY_ORDER: readonly string[] = DOCUMENT_CATEGORIES
/** The stored value of the association section; its visible heading comes from `club.associationLabel`. */
export const ASSOCIATION_CATEGORY = 'Association directory'
export const categoryLabel = (category: string, associationLabel: string): string =>
  category === ASSOCIATION_CATEGORY ? associationLabel || category : category
