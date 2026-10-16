import { APIError, ValidationError, type CollectionConfig, type Field } from 'payload'
import { isAdmin, isStaff, nobody } from '../access'
import { noCardNumbers } from '../../lib/office/card'
import { CATEGORY_LABEL, MAX_QTY, MOVEMENT_KINDS, KIND_LABEL, STOCK_CATEGORIES, returnableByDefault } from '../../lib/office/stock'
import { voidFields } from './feeLedger'

/**
 * Stock and merch (wave D spec section 10). Items are club figures, not personal data, so the committee (admin and editor) reads and
 * edits them and only an admin deletes (and only an item with no history). The movements ledger and the issues are read by the
 * committee but written by nobody over REST or in the admin: the Stock server actions write with the access override after their
 * own staff check, inside a transaction that locks the item, so the rules (no negative stock without a tick, one return per unit,
 * append-only with a reason on every void) cannot be bypassed from a form. Stock on hand is never stored; it is added up from the ledger.
 */
const options = <T extends string>(values: readonly T[], labels: Record<string, string> = {}) => values.map((value) => ({ label: labels[value] ?? value, value }))
const idOf = (raw: unknown): number | string | null => {
  const v = typeof raw === 'object' && raw !== null ? (raw as { id?: unknown }).id : raw
  return typeof v === 'number' || typeof v === 'string' ? v : null
}
const dayOnly = { date: { pickerAppearance: 'dayOnly' as const } }

const ledger = (c: { slug: string; singular: string; plural: string; description: string; defaultColumns: string[]; fields: Field[]; indexes?: CollectionConfig['indexes']; hooks?: CollectionConfig['hooks'] }): CollectionConfig => ({
  slug: c.slug,
  labels: { singular: c.singular, plural: c.plural },
  admin: { group: false, hideAPIURL: true, defaultColumns: c.defaultColumns, description: c.description },
  disableDuplicate: true,
  access: { read: isStaff, create: nobody, update: nobody, delete: nobody },
  indexes: c.indexes,
  hooks: c.hooks,
  timestamps: true,
  fields: c.fields,
})

export const StockItems: CollectionConfig = {
  slug: 'stock-items',
  labels: { singular: 'Stock item', plural: 'Stock items' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'name',
    defaultColumns: ['name', 'size', 'category', 'reorderLevel', 'active'],
    description: 'Kit, equipment and supplies the club holds. One row for each size. Day to day, use Club office, then Stock: it shows how many are on hand.',
  },
  defaultSort: 'name',
  disableDuplicate: true,
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isAdmin },
  timestamps: true,
  hooks: {
    // The database would also refuse (the ledger needs its item), but this gives a plain message. An item that was used is switched off instead.
    beforeDelete: [
      async ({ id, req }) => {
        const used =
          (await req.payload.count({ collection: 'stock-movements', where: { item: { equals: id } }, overrideAccess: true, req })).totalDocs +
          (await req.payload.count({ collection: 'stock-issues', where: { item: { equals: id } }, overrideAccess: true, req })).totalDocs
        if (used > 0) throw new APIError('This item has stock history, so it cannot be deleted. Switch it off instead (untick "In use").', 400, undefined, true)
      },
    ],
    beforeValidate: [
      ({ data, operation }) => {
        // "Expected back" follows the type of item unless it was set by hand. A default value cannot see the type, so it is filled here.
        if (operation === 'create' && data && (data as { returnable?: unknown }).returnable === undefined) (data as { returnable?: boolean }).returnable = returnableByDefault((data as { category?: unknown }).category)
        return data
      },
    ],
  },
  fields: [
    { name: 'name', label: 'Item', type: 'text', required: true, maxLength: 120, validate: (v: unknown) => (typeof v !== 'string' || !v.trim() ? 'Please give the item a name.' : noCardNumbers(v)) },
    { name: 'groupName', label: 'Group', type: 'text', maxLength: 80, validate: noCardNumbers, admin: { description: 'Keeps sizes together, for example "Playing shirt". Items with the same group are listed together.' } },
    { name: 'size', label: 'Size', type: 'text', maxLength: 40, validate: noCardNumbers, admin: { width: '25%' } },
    { name: 'category', label: 'Type', type: 'select', required: true, defaultValue: 'kit', options: options(STOCK_CATEGORIES, CATEGORY_LABEL), admin: { width: '25%' } },
    { name: 'unit', label: 'Counted in', type: 'text', defaultValue: 'each', maxLength: 30, validate: noCardNumbers, admin: { width: '25%', description: 'For example each, box or dozen.' } },
    { name: 'reorderLevel', label: 'Low when this many or fewer', type: 'number', min: 0, max: MAX_QTY, admin: { step: 1, description: 'Leave empty to not check this item for low stock.' } },
    { name: 'location', label: 'Where it is kept', type: 'text', maxLength: 120, validate: noCardNumbers },
    { name: 'returnable', label: 'Expected back', type: 'checkbox', admin: { description: 'Tick for things people borrow and give back, such as helmets. Untick for things given away, such as caps.' } },
    { name: 'active', label: 'In use', type: 'checkbox', defaultValue: true, index: true, admin: { description: 'Untick to stop issuing it and to leave it out of the low stock count. Its history stays.' } },
    { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 1000, validate: noCardNumbers },
  ],
}

export const StockIssues = ledger({
  slug: 'stock-issues',
  singular: 'Stock issue',
  plural: 'Stock issues',
  description: 'Kit handed to a person. Whether it is out, part returned or returned is worked out from the returns recorded against it. Managed from Club office, then Stock.',
  defaultColumns: ['item', 'member', 'qty', 'issuedOn', 'dueBackOn'],
  fields: [
    { name: 'item', label: 'Item', type: 'relationship', relationTo: 'stock-items', required: true, index: true },
    { name: 'member', label: 'Person', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'qty', label: 'Number issued', type: 'number', required: true, min: 1, max: MAX_QTY },
    { name: 'issuedOn', label: 'Issued on', type: 'date', required: true, admin: dayOnly },
    { name: 'dueBackOn', label: 'Due back on', type: 'date', admin: dayOnly },
    { name: 'returnable', label: 'Expected back', type: 'checkbox', defaultValue: true, admin: { description: 'Copied from the item when it was issued, so changing the item later does not change this.' } },
    { name: 'note', label: 'Note', type: 'text', maxLength: 300, validate: noCardNumbers },
    { name: 'recordedBy', label: 'Recorded by', type: 'relationship', relationTo: 'users' },
    ...voidFields,
  ],
})

/** Quantities are whole numbers; only a stocktake or correction may be negative, and never zero. */
const qtyRule = (value: unknown, { siblingData }: { siblingData: unknown }): true | string => {
  const kind = (siblingData as { kind?: unknown } | undefined)?.kind
  if (typeof value !== 'number' || !Number.isInteger(value) || value === 0 || Math.abs(value) > MAX_QTY) return 'Quantities are whole numbers, not zero.'
  if (kind !== 'adjustment' && value < 0) return 'Only a stocktake or correction can be negative.'
  return true
}

export const StockMovements = ledger({
  slug: 'stock-movements',
  singular: 'Stock movement',
  plural: 'Stock movements',
  description: 'Every time stock came in, went out or was corrected. Never edited: a mistake is voided with a reason and stock on hand is added up from what is not voided.',
  defaultColumns: ['item', 'kind', 'qty', 'date', 'member'],
  indexes: [{ fields: ['item', 'date'] }],
  hooks: {
    beforeValidate: [
      async ({ data, req }) => {
        // Nobody can write this over REST, but the server actions and any script that uses the override go through the same rules.
        const raw = (data as { item?: unknown } | undefined)?.item
        const id = idOf(raw)
        if (id === null) return data
        const n = (await req.payload.count({ collection: 'stock-items', where: { id: { equals: id } }, overrideAccess: true, req })).totalDocs
        if (n === 0) throw new ValidationError({ errors: [{ path: 'item', message: 'Pick an item from the list.' }] })
        return data
      },
    ],
  },
  fields: [
    { name: 'item', label: 'Item', type: 'relationship', relationTo: 'stock-items', required: true, index: true },
    { name: 'kind', label: 'What happened', type: 'select', required: true, index: true, options: options(MOVEMENT_KINDS, KIND_LABEL) },
    { name: 'qty', label: 'Number', type: 'number', required: true, validate: qtyRule as never },
    { name: 'date', label: 'Date', type: 'date', required: true, admin: dayOnly },
    { name: 'member', label: 'Person', type: 'relationship', relationTo: 'members', admin: { description: 'For issued and returned stock.' } },
    { name: 'issue', label: 'Issue', type: 'relationship', relationTo: 'stock-issues', admin: { description: 'The issue this movement belongs to: its own issue, or the one a return or loss settles.' } },
    { name: 'note', label: 'Note', type: 'text', maxLength: 300, validate: noCardNumbers },
    { name: 'idempotencyKey', label: 'Form key', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'Stops a double click recording one movement twice.' } },
    { name: 'recordedBy', label: 'Recorded by', type: 'relationship', relationTo: 'users' },
    ...voidFields,
  ],
})
