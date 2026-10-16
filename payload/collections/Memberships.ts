import type { CollectionConfig, FieldHook } from 'payload'
import { ValidationError } from 'payload'
import { isAdmin } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { noCardNumbers } from '../../lib/office/card'
import { isSeasonName } from '../../lib/office/season'
import { adminFields, serverOwnedAccess } from './officeAccess'

type Doc = Record<string, unknown>
const relId = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)

const loadTier = async (req: Parameters<FieldHook>[0]['req'], id: number | null): Promise<Doc | null> => {
  if (id === null) return null
  try {
    return (await req.payload.findByID({ collection: 'membership-tiers', id, depth: 0, overrideAccess: true, req })) as unknown as Doc
  } catch {
    return null
  }
}

/** Copies one rate from the tier when the membership is created (or its tier changes while the season is open). */
const snapshot = (key: 'upfrontCents' | 'perMatchCents'): FieldHook =>
  async ({ value, data, originalDoc, operation, req }) => {
    const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as Doc
    const tierChanged = operation === 'update' && relId((data ?? {}).tier) !== null && relId((data ?? {}).tier) !== relId((originalDoc ?? {}).tier)
    if (operation === 'update' && !tierChanged) return (originalDoc as Doc | undefined)?.[`${key}Snapshot`] ?? value
    const tier = await loadTier(req, relId(merged.tier))
    return typeof tier?.[key] === 'number' ? tier[key] : 0
  }

const fail = (path: string, message: string): never => {
  throw new ValidationError({ errors: [{ path, message }] })
}

/**
 * Memberships (wave D spec section 4.1): which member joined which season on which membership type. The type's two rates are copied
 * onto the membership when it is created, and charges always use the copy, so editing or deleting a tier later cannot change what a
 * member owes. One membership per member per season. Admin only. A closed season takes no new memberships.
 */
export const Memberships: CollectionConfig = {
  slug: 'memberships',
  labels: { singular: 'Membership', plural: 'Memberships' },
  admin: {
    group: false,
    hideAPIURL: true,
    hidden: hiddenFromEditors,
    defaultColumns: ['member', 'season', 'tier', 'joinedOn'],
    description: 'Who joined which season. Add members to a season from Club office, then Fees.',
  },
  defaultSort: '-season',
  disableDuplicate: true,
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  indexes: [{ fields: ['member', 'season'], unique: true }],
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as Doc
        const season = String(merged.season ?? '')
        const closed = await req.payload.count({ collection: 'fee-seasons', where: { and: [{ season: { equals: season } }, { status: { equals: 'closed' } }] }, overrideAccess: true, req })
        if (closed.totalDocs > 0) fail('season', 'That season is closed, so memberships in it cannot change.')
        const tier = await loadTier(req, relId(merged.tier))
        if (!tier) fail('tier', 'Pick a membership type.')
        else if (tier.season !== season) fail('tier', 'That membership type belongs to a different season.')
        if (operation === 'update' && originalDoc) {
          const o = originalDoc as Doc
          if (relId(merged.member) !== relId(o.member) || season !== o.season) fail('member', 'To move a membership, remove it and add a new one.')
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const row = (await req.payload.findByID({ collection: 'memberships', id, depth: 0, overrideAccess: true, req })) as unknown as Doc
        const closed = await req.payload.count({ collection: 'fee-seasons', where: { and: [{ season: { equals: String(row.season) } }, { status: { equals: 'closed' } }] }, overrideAccess: true, req })
        if (closed.totalDocs > 0) fail('season', 'That season is closed, so memberships in it cannot be removed.')
      },
    ],
  },
  fields: adminFields([
    { name: 'member', label: 'Member', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'season', label: 'Season', type: 'text', required: true, index: true, validate: (v: unknown) => (isSeasonName(v) ? true : 'Use the season name, for example 2026/27.') },
    { name: 'tier', label: 'Membership type', type: 'relationship', relationTo: 'membership-tiers', required: true },
    { name: 'joinedOn', label: 'Joined on', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' }, description: 'Optional. The season fee is dated from this day (otherwise the season start).' } },
    { name: 'note', label: 'Note', type: 'text', maxLength: 300, validate: noCardNumbers },
    { name: 'upfrontCentsSnapshot', label: 'Season fee when joined (cents)', type: 'number', access: serverOwnedAccess, hooks: { beforeChange: [snapshot('upfrontCents')] }, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'perMatchCentsSnapshot', label: 'Fee per game when joined (cents)', type: 'number', access: serverOwnedAccess, hooks: { beforeChange: [snapshot('perMatchCents')] }, admin: { readOnly: true, position: 'sidebar' } },
  ]),
}
