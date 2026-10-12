import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminField, nobody, nobodyField } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { AUDIT_ACTIONS } from '../../lib/office/audit'

const logField = { read: isAdminField, create: nobodyField, update: nobodyField } as const

/**
 * The exports and sends log (wave D spec section 3.1): who exported, sent, erased or bulk-changed what, and when. Counts and filter
 * keys only, never a name, an address or search text (`lib/office/audit.ts` builds the summary). Admins read it; nobody writes over REST
 * or in the admin, and server code writes rows after its own admin check.
 */
export const OfficeAuditLog: CollectionConfig = {
  slug: 'office-audit-log',
  labels: { singular: 'Log entry', plural: 'Exports and sends log' },
  admin: {
    group: false,
    hideAPIURL: true,
    hidden: hiddenFromEditors,
    defaultColumns: ['at', 'action', 'module', 'rowCount', 'user'],
    description: 'Every export, email send, removal of personal details and bulk member change, with who did it. Opening one member is not logged.',
  },
  defaultSort: '-at',
  disableDuplicate: true,
  access: { read: isAdmin, create: nobody, update: nobody, delete: nobody },
  timestamps: true,
  fields: [
    { name: 'at', label: 'When', type: 'date', required: true, index: true, access: logField, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'user', label: 'Who', type: 'relationship', relationTo: 'users', access: logField },
    { name: 'action', label: 'What', type: 'select', required: true, options: AUDIT_ACTIONS.map((value) => ({ label: value, value })), access: logField },
    { name: 'module', label: 'Where', type: 'text', required: true, access: logField },
    { name: 'summary', label: 'Details', type: 'json', access: logField, admin: { description: 'Filter keys and counts only.' } },
    { name: 'rowCount', label: 'Rows', type: 'number', access: logField },
    { name: 'includedSensitive', label: 'Included date of birth, emergency contact and notes', type: 'checkbox', defaultValue: false, access: logField },
  ],
}
