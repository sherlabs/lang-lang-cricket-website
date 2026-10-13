import type { CollectionConfig, Field } from 'payload'
import type { FilterChip } from '../../lib/admin/filter-chips'

/**
 * Small helpers that wire the WP-4 list and form pieces into collection configs, so each collection states what it wants
 * ("a photo column", "a Details area") instead of repeating component paths. Config only: no schema change.
 */
const CELLS = '/payload/components/ListCells'

/** `admin.components.Cell` for a list column; `clientProps` carries the words for a switch ("Showing on the website" / "Hidden"). */
export const cell = (name: string, clientProps?: Record<string, unknown>) => (clientProps ? { path: `${CELLS}#${name}`, clientProps } : `${CELLS}#${name}`)

/** The one-line picture hint every picture field shares. */
export const IMAGE_HINT = 'JPG, PNG or WebP, at least 800px wide.'

/** `admin.components` for a picture field: a real preview of the chosen picture under Payload's own Choose, Replace and Remove controls. */
export const uploadPreview = (opts: { fit?: 'cover' | 'contain' } = {}) => ({
  afterInput: [{ path: '/payload/components/UploadPreview#UploadPreview', clientProps: opts }],
})

const docMeta: Field = { name: 'docMeta', label: 'Dates', type: 'ui', admin: { components: { Field: '/payload/components/DocMeta#DocMeta' } } }

/**
 * The closed "Details" area at the end of a form: internal fields (web address, where a record came from, values the nightly update
 * works out) plus when it was added and last changed. A layout field only (no name), so it changes no data and needs no migration.
 * Pass `condition` when every field inside is admin only, so editors do not see an empty heading.
 */
export const detailsGroup = (fields: Field[], condition?: (...args: never[]) => boolean): Field => ({
  type: 'collapsible',
  label: 'Details',
  admin: { initCollapsed: true, className: 'club-details', ...(condition ? { condition: condition as never } : {}) },
  fields: [...fields, docMeta],
})

/** `admin.components.edit.beforeDocumentControls`: the "Back to ..." link and the save state line. */
export const saveState = (opts: { statusPath?: string; liveValue?: string } = {}) => ({
  edit: { beforeDocumentControls: [{ path: '/payload/components/SaveState#SaveState', clientProps: opts }] },
})

/** `admin.components.beforeList`: the plain filter chips. */
export const filterChips = (chips: FilterChip[], opts: { label?: string; allLabel?: string } = {}) => ({
  beforeList: [{ path: '/payload/components/ListFilterChips#ListFilterChips', clientProps: { chips, ...opts } }],
})

/** `where` query parameters for `{ field: { op: value } }` pairs joined with AND, written the way Payload writes them in the address. */
export const whereParams = (and: Array<Record<string, Record<string, string>>>): Record<string, string> => {
  const out: Record<string, string> = {}
  and.forEach((clause, i) => {
    for (const [field, ops] of Object.entries(clause)) for (const [op, v] of Object.entries(ops)) out[`where[and][${i}][${field}][${op}]`] = v
  })
  return out
}

export type CollectionAdmin = NonNullable<CollectionConfig['admin']>
