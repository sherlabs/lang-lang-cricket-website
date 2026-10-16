import type { Access, CollectionConfig, Field } from 'payload'
import { isStaff, nobody } from '../access'

/**
 * A "selection collection" (announce-teams spec section 1, `selectionCollections` in `payload/admin/navigation.ts`): data the
 * selectors work with, managed in the selector area and never as raw rows in the admin. Hidden from the sidebar for every role.
 * Over REST only admins and editors can read or write (a selector gets nothing here, exactly as an anonymous visitor): selector
 * writes go through server actions that validate with the pure functions and derive who did it from the signed-in user.
 * Rows are written by code with the Local API (access override) after that role check.
 */
export function selectionCollection(opts: {
  slug: string
  singular: string
  plural: string
  description: string
  defaultColumns: string[]
  fields: Field[]
  indexes?: NonNullable<CollectionConfig['indexes']>
  hooks?: CollectionConfig['hooks']
  /** Defaults to staff (admin or editor). */
  read?: Access
  create?: Access
  update?: Access
  delete?: Access
  useAsTitle?: string
}): CollectionConfig {
  return {
    slug: opts.slug,
    labels: { singular: opts.singular, plural: opts.plural },
    admin: {
      group: false,
      hideAPIURL: true,
      hidden: true,
      useAsTitle: opts.useAsTitle,
      defaultColumns: opts.defaultColumns,
      description: opts.description,
    },
    access: { read: opts.read ?? isStaff, create: opts.create ?? isStaff, update: opts.update ?? isStaff, delete: opts.delete ?? isStaff },
    indexes: opts.indexes,
    hooks: opts.hooks,
    timestamps: true,
    fields: opts.fields,
  }
}

/** Fields only code may write or read: never over REST, never in the admin form. */
export const codeOnlyAccess = { read: () => false, create: () => false, update: () => false }
export { nobody }
