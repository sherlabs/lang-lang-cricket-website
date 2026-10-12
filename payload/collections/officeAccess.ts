import type { Field } from 'payload'
import { isAdminField, nobodyField } from '../access'

/**
 * Field access for personal and financial office data (wave D spec section 1): every field says explicitly who may read, create and
 * update it. `adminFields` stamps admin-only access on a list of fields (and on the fields of a group), so no field of a personal
 * collection can silently fall back to the collection rule. `tests/office-field-access.test.ts` walks the sanitised config and fails
 * on any field without all three functions.
 */
export const adminAccess = { read: isAdminField, create: isAdminField, update: isAdminField } as const
/** Server-owned: readable by admins, written only by hooks or by code that overrides access. */
export const serverOwnedAccess = { read: isAdminField, create: nobodyField, update: nobodyField } as const

export function adminFields(fields: Field[]): Field[] {
  return fields.map((f) => {
    const withAccess = { ...f, access: { ...adminAccess, ...('access' in f ? f.access : {}) } } as Field
    if (withAccess.type === 'group') return { ...withAccess, fields: adminFields(withAccess.fields) } as Field
    return withAccess
  })
}
