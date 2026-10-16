import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'
import { isAdmin } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { isSeasonName } from '../../lib/office/season'
import { adminFields } from './officeAccess'

export const RATE_IN_USE = 'This rate is in use. Create a new tier or copy it for next season.'
type Doc = Record<string, unknown>

/**
 * Membership types (wave D spec section 4.1): what a season costs, as a fixed fee, a rate per game, both, or nothing. Admin only.
 * Amounts are integer cents. Once any membership uses a tier its two amounts cannot change (name and Active still can), so a rate
 * cannot silently rewrite what members owe; memberships also copy the rates when they are created, as a second guard.
 */
export const MembershipTiers: CollectionConfig = {
  slug: 'membership-tiers',
  labels: { singular: 'Membership type', plural: 'Membership types' },
  admin: {
    group: false,
    hideAPIURL: true,
    hidden: hiddenFromEditors,
    useAsTitle: 'name',
    defaultColumns: ['season', 'name', 'kind', 'upfrontCents', 'perMatchCents', 'active'],
    description: 'What each kind of membership costs per season. Easier to set up from Club office, then Fees. Amounts are in cents (2000 is 20.00).',
  },
  defaultSort: '-season',
  disableDuplicate: true,
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const out: Doc = { ...data }
        if (out.kind === 'free') {
          out.upfrontCents = 0
          out.perMatchCents = 0
        }
        return out
      },
    ],
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        if (operation !== 'update' || !originalDoc) return data
        const d = data as Doc
        const o = originalDoc as Doc
        const changed = (k: string) => k in d && Number(d[k] ?? 0) !== Number(o[k] ?? 0)
        if (!changed('upfrontCents') && !changed('perMatchCents') && !(typeof d.season === 'string' && d.season !== o.season)) return data
        const used = await req.payload.count({ collection: 'memberships', where: { tier: { equals: o.id as number } }, overrideAccess: true, req })
        if (used.totalDocs > 0) throw new ValidationError({ errors: [{ path: 'upfrontCents', message: RATE_IN_USE }] })
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const used = await req.payload.count({ collection: 'memberships', where: { tier: { equals: id as number } }, overrideAccess: true, req })
        if (used.totalDocs > 0) throw new ValidationError({ errors: [{ path: 'name', message: 'Members use this type, so it cannot be deleted. Untick Active instead.' }] })
      },
    ],
  },
  fields: adminFields([
    { name: 'season', label: 'Season', type: 'text', required: true, index: true, validate: (v: unknown) => (isSeasonName(v) ? true : 'Use the season name, for example 2026/27.') },
    { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 80 },
    {
      name: 'kind',
      label: 'How it is charged',
      type: 'select',
      required: true,
      defaultValue: 'upfront',
      options: [
        { label: 'Fixed fee for the season', value: 'upfront' },
        { label: 'Per game played', value: 'per-match' },
        { label: 'Free', value: 'free' },
      ],
    },
    { name: 'upfrontCents', label: 'Season fee (cents)', type: 'number', min: 0, max: 100_000_000, defaultValue: 0, admin: { step: 1, description: 'Charged once when the member joins. Leave at 0 for none.' } },
    { name: 'perMatchCents', label: 'Fee per game (cents)', type: 'number', min: 0, max: 100_000_000, defaultValue: 0, admin: { step: 1, description: 'Charged for each final game the member plays. Leave at 0 for none.' } },
    { name: 'active', label: 'Offered to new members', type: 'checkbox', defaultValue: true },
  ]),
}
