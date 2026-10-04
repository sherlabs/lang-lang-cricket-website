import type { CollectionConfig, Field } from 'payload'
import { isStaff, nobody } from '../access'

/**
 * A collection that only code writes (sync, scripts, seed) and nobody edits in the admin. It is
 * hidden from the sidebar for everyone (including admins), listed in `internalCollections` in
 * `payload/admin/navigation.ts`, readable by staff only through REST, and never writable through
 * REST or the admin. Code writes through `payload.db.drizzle`, which bypasses access and hooks.
 */
export function internalCollection(opts: {
  slug: string
  singular: string
  plural: string
  description: string
  defaultColumns: string[]
  fields: Field[]
  indexes?: NonNullable<CollectionConfig['indexes']>
}): CollectionConfig {
  return {
    slug: opts.slug,
    labels: { singular: opts.singular, plural: opts.plural },
    admin: {
      group: false,
      hideAPIURL: true,
      hidden: true,
      defaultColumns: opts.defaultColumns,
      description: opts.description,
    },
    access: { read: isStaff, create: nobody, update: nobody, delete: nobody },
    indexes: opts.indexes,
    timestamps: true,
    fields: opts.fields,
  }
}

export const text = (name: string, extra: Partial<Field> = {}): Field => ({ name, type: 'text', ...extra }) as Field
export const num = (name: string, extra: Partial<Field> = {}): Field => ({ name, type: 'number', ...extra }) as Field
export const flag = (name: string): Field => ({ name, type: 'checkbox' })
export const rel = (name: string, relationTo: string, extra: Partial<Field> = {}): Field =>
  ({ name, type: 'relationship', relationTo, ...extra }) as Field
