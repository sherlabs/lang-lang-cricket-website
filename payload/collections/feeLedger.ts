import type { CollectionConfig, Field } from 'payload'
import { isAdmin, nobody } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { noCardNumbers } from '../../lib/office/card'
import { serverOwnedAccess } from './officeAccess'

/** Stamps server-owned access (admin reads, nobody writes) on every field, including those inside groups. */
const owned = (fields: Field[]): Field[] =>
  fields.map((f) => {
    const w = { ...f, access: serverOwnedAccess } as Field
    return w.type === 'group' ? ({ ...w, fields: owned(w.fields) } as Field) : w
  })

/**
 * The fee ledger collections (wave D spec 4.1): payments, waivers, closed-season charges and the season status. Admins read them;
 * nobody writes over REST or in the admin. The Fees server actions write with the access override after their own admin check, so
 * the rules (no card data, a reason on every void, append-only) cannot be bypassed from a form. Rows are voided, never deleted.
 */
export const ledgerCollection = (c: { slug: string; singular: string; plural: string; description: string; defaultColumns: string[]; fields: Field[]; indexes?: CollectionConfig['indexes'] }): CollectionConfig => ({
  slug: c.slug,
  labels: { singular: c.singular, plural: c.plural },
  admin: { group: false, hideAPIURL: true, hidden: hiddenFromEditors, defaultColumns: c.defaultColumns, description: c.description },
  disableDuplicate: true,
  access: { read: isAdmin, create: nobody, update: nobody, delete: nobody },
  indexes: c.indexes,
  timestamps: true,
  fields: owned(c.fields),
})

export const voidFields: Field[] = [
  { name: 'voidedAt', label: 'Voided on', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  { name: 'voidedBy', label: 'Voided by', type: 'relationship', relationTo: 'users' },
  { name: 'voidReason', label: 'Why it was voided', type: 'text', maxLength: 300, validate: noCardNumbers },
]
const member: Field = { name: 'member', label: 'Member', type: 'relationship', relationTo: 'members', required: true, index: true }
const season: Field = { name: 'season', label: 'Season', type: 'text', index: true }

export const FeeSeasons = ledgerCollection({
  slug: 'fee-seasons',
  singular: 'Fee season',
  plural: 'Fee seasons',
  description: 'Which seasons have been closed. A season with no row here is open. Written by the Close season button.',
  defaultColumns: ['season', 'status', 'closedAt', 'chargesTotalCents'],
  fields: [
    { name: 'season', label: 'Season', type: 'text', required: true, unique: true, index: true },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'open', options: [{ label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }] },
    { name: 'closedAt', label: 'Closed on', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'closedBy', label: 'Closed by', type: 'relationship', relationTo: 'users' },
    { name: 'chargesTotalCents', label: 'Charges total (cents)', type: 'number' },
    { name: 'snapshotCount', label: 'Charges stored', type: 'number' },
    { name: 'closedAnyway', label: 'Closed with unmatched games', type: 'checkbox', defaultValue: false },
    { name: 'idempotencyKey', label: 'Form key', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'Stops a double click closing the season twice.' } },
  ],
})

export const FeeCharges = ledgerCollection({
  slug: 'fee-charges',
  singular: 'Fee charge',
  plural: 'Fee charges',
  description: 'What each member was charged in a closed season. Frozen when the season closed; a correction is a void plus an adjustment.',
  defaultColumns: ['member', 'season', 'kind', 'date', 'amountCents'],
  indexes: [{ fields: ['member', 'season'] }],
  fields: [
    member,
    { ...season, required: true },
    { name: 'kind', label: 'Kind', type: 'select', required: true, options: [{ label: 'Season fee', value: 'season' }, { label: 'Game', value: 'game' }, { label: 'Adjustment', value: 'adjustment' }] },
    { name: 'date', label: 'Date', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'matchId', label: 'Game id', type: 'text', admin: { description: 'Kept as a value so a later PlayHQ sync or player merge cannot move it.' } },
    { name: 'amountCents', label: 'Amount (cents)', type: 'number', required: true, min: 1 },
    { name: 'description', label: 'Description', type: 'text', maxLength: 300, validate: noCardNumbers },
    { name: 'closedAt', label: 'Closed on', type: 'date' },
    { name: 'idempotencyKey', label: 'Form key', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'Stops a double click adding one adjustment twice.' } },
    ...voidFields,
  ],
})

export const FeePayments = ledgerCollection({
  slug: 'fee-payments',
  singular: 'Fee payment',
  plural: 'Fee payments',
  description: 'Money received, recorded by hand. No card details are ever stored. A mistake is voided with a reason, not edited.',
  defaultColumns: ['member', 'receivedOn', 'amountCents', 'method', 'payer'],
  indexes: [{ fields: ['member', 'receivedOn'] }],
  fields: [
    member,
    { name: 'payer', label: 'Paid by', type: 'relationship', relationTo: 'members' },
    { name: 'splitGroup', label: 'Split group', type: 'text', index: true, admin: { description: 'Shared by the rows made when one payment was split across children.' } },
    { name: 'idempotencyKey', label: 'Form key', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'Stops a double click recording one payment twice.' } },
    { name: 'receivedOn', label: 'Received on', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'amountCents', label: 'Amount (cents)', type: 'number', required: true, min: 1 },
    { name: 'method', label: 'Method', type: 'select', required: true, options: [{ label: 'Cash', value: 'cash' }, { label: 'Bank transfer', value: 'bank-transfer' }, { label: 'Other', value: 'other' }] },
    { name: 'reference', label: 'Reference', type: 'text', maxLength: 120, validate: noCardNumbers },
    { name: 'note', label: 'Note', type: 'text', maxLength: 500, validate: noCardNumbers },
    {
      name: 'appliesTo',
      label: 'Aimed at',
      type: 'group',
      fields: [
        { name: 'kind', label: 'Kind', type: 'select', options: [{ label: 'Season', value: 'season' }, { label: 'One charge', value: 'charge' }] },
        { name: 'season', label: 'Season', type: 'text' },
        { name: 'chargeId', label: 'Charge', type: 'text' },
        { name: 'matchId', label: 'Game', type: 'text' },
      ],
    },
    { name: 'recordedBy', label: 'Recorded by', type: 'relationship', relationTo: 'users' },
    ...voidFields,
  ],
})

export const FeeWaivers = ledgerCollection({
  slug: 'fee-waivers',
  singular: 'Fee waiver',
  plural: 'Fee waivers',
  description: 'Fees the committee has waived, with the reason. Voided, never edited.',
  defaultColumns: ['member', 'scope', 'season', 'amountCents', 'grantedBy'],
  indexes: [{ fields: ['member'] }],
  fields: [
    member,
    { name: 'scope', label: 'Covers', type: 'select', required: true, options: [{ label: 'One game', value: 'game' }, { label: 'Whole season', value: 'season' }, { label: 'An amount', value: 'amount' }] },
    { name: 'matchId', label: 'Game id', type: 'text' },
    season,
    { name: 'amountCents', label: 'Amount (cents)', type: 'number', min: 1 },
    { name: 'note', label: 'Reason', type: 'text', required: true, maxLength: 500, validate: noCardNumbers },
    { name: 'grantedBy', label: 'Granted by', type: 'relationship', relationTo: 'users' },
    { name: 'idempotencyKey', label: 'Form key', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'Stops a double click granting one waiver twice.' } },
    ...voidFields,
  ],
})
