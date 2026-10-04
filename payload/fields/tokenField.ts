import { randomUUID } from 'node:crypto'
import type { TextField } from 'payload'
import { isStaffField, nobodyField } from '../access'

/**
 * A secret link token (spec §2, §3.9, §3.11): `editToken` / `viewToken`.
 * - Field access: staff-only read (so anonymous `where`/`sort` on it is rejected too); nobody
 *   may create or update it over REST/admin. Hidden in the admin.
 * - Not `required`: field access strips a REST-supplied value in the beforeValidate traversal,
 *   so the value is produced here, in the field's `beforeChange` hook, which runs afterwards.
 * - create: keep a supplied value (server actions and the ETL run with overrideAccess), else
 *   generate `randomUUID()`. update: always reset to the stored value, unless `context.etl`.
 */
export const tokenField = (name: 'editToken' | 'viewToken' = 'editToken'): TextField => ({
  name,
  type: 'text',
  unique: true,
  index: true,
  access: { read: isStaffField, create: nobodyField, update: nobodyField },
  admin: { hidden: true },
  hooks: {
    beforeChange: [
      ({ value, operation, originalDoc, req }) => {
        if (operation === 'create') return typeof value === 'string' && value ? value : randomUUID()
        if (req.context?.etl) return value
        return (originalDoc as Record<string, unknown> | undefined)?.[name] ?? value
      },
    ],
  },
})
