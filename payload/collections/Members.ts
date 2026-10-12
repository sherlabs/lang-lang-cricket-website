import type { CollectionConfig, FieldHook } from 'payload'
import { ValidationError } from 'payload'
import { isAdmin } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { noCardNumbers } from '../../lib/office/card'
import { displayNameFor, IMPORT_SOURCES, MEMBER_ROLES, MEMBER_STATUSES, ROLE_LABELS } from '../../lib/office/members'
import { isValidEmail, normaliseEmail, normalisePhone, trimOrNull } from '../../lib/office/member-input'
import { adminFields, serverOwnedAccess } from './officeAccess'

const TEXT_KEYS = ['firstName', 'lastName', 'preferredName', 'addressLine', 'locality', 'region', 'postalCode', 'notes'] as const

type Doc = Record<string, unknown>
const relId = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)

/** The one name used as the list title and search field: derived on every save from the typed or linked name. */
const deriveDisplayName: FieldHook = async ({ data, originalDoc, req }) => {
  const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as Doc
  const playerId = relId(merged.player)
  let player: Doc | null = null
  if (playerId !== null) {
    try {
      player = (await req.payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true, req })) as unknown as Doc
    } catch {
      player = null
    }
  }
  return displayNameFor({ firstName: merged.firstName as string, lastName: merged.lastName as string, preferredName: merged.preferredName as string, erasedAt: merged.erasedAt as string, player })
}

/**
 * Old personal links stop working when a member is archived, put on the do-not-email list, erased, or when an admin asks for it
 * (`context.bumpVolunteerLinks`). The version only ever counts up.
 */
const bumpLinkVersion: FieldHook = ({ value, data, originalDoc, operation, req }) => {
  const prev = typeof (originalDoc as Doc | undefined)?.volunteerLinkVersion === 'number' ? ((originalDoc as Doc).volunteerLinkVersion as number) : 0
  if (operation === 'create') return 0
  const d = (data ?? {}) as Doc
  const o = (originalDoc ?? {}) as Doc
  const archived = d.status === 'past' && o.status !== 'past'
  const muted = d.doNotEmail === true && o.doNotEmail !== true
  const erased = Boolean(d.erasedAt) && !o.erasedAt
  return archived || muted || erased || req.context?.bumpVolunteerLinks === true ? prev + 1 : (value as number | undefined) ?? prev
}

/**
 * Members (wave D spec section 3): the club's people with their contact details. Admin only in every operation and on every field;
 * `players` and `people` stay public and never gain a private field. A member links to a player (so the name is not duplicated) and
 * holds the contact details, roles and status. Written from the quick-add form, the native page (admin fallback) and the link-players
 * action; personal-data removal goes through `lib/office/erase.ts`.
 */
export const Members: CollectionConfig = {
  slug: 'members',
  labels: { singular: 'Member', plural: 'Members' },
  admin: {
    group: false,
    hideAPIURL: true,
    // Admin only: an editor who types the address gets the not-found page (the spike in the wave D spec, section 3.3).
    hidden: hiddenFromEditors,
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'roles', 'status', 'email'],
    listSearchableFields: ['displayName', 'email'],
    description: 'The club’s members with their contact details. Open this from Club office, then Members. Only admins can see it.',
  },
  defaultSort: 'displayName',
  disableDuplicate: true,
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const out: Doc = { ...data }
        for (const k of TEXT_KEYS) if (k in out) out[k] = trimOrNull(out[k])
        if ('email' in out) out.email = normaliseEmail(out.email)
        if ('phone' in out) out.phone = normalisePhone(out.phone)
        return out
      },
    ],
    beforeChange: [
      ({ data, originalDoc }) => {
        const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as Doc
        if (!merged.erasedAt && relId(merged.player) === null && relId(merged.person) === null && (!merged.firstName || !merged.lastName)) {
          throw new ValidationError({ errors: [{ path: 'firstName', message: 'Type a first and last name, or link a player.' }] })
        }
        return data
      },
    ],
  },
  fields: adminFields([
    { name: 'displayName', type: 'text', index: true, access: serverOwnedAccess, hooks: { beforeChange: [deriveDisplayName] }, admin: { hidden: true, readOnly: true } },
    {
      name: 'player',
      label: 'Linked player',
      type: 'relationship',
      relationTo: 'players',
      // One member row per player. Postgres treats nulls as distinct, so any number of members without a player is fine.
      unique: true,
      admin: { description: 'Pick the player when this member plays for the club. The name then comes from the player, so you do not type it twice.' },
    },
    { name: 'person', label: 'Committee or coach record', type: 'relationship', relationTo: 'people', admin: { description: 'Optional: the committee or coach record for the same person.' } },
    { name: 'firstName', label: 'First name', type: 'text', maxLength: 100, admin: { description: 'Needed only when no player is linked.', condition: (data) => !data?.player } },
    { name: 'lastName', label: 'Last name', type: 'text', maxLength: 100, admin: { condition: (data) => !data?.player } },
    { name: 'preferredName', label: 'Preferred name', type: 'text', maxLength: 100, admin: { description: 'A nickname to show instead of the full name.', condition: (data) => !data?.player } },
    { name: 'roles', label: 'Roles', type: 'select', hasMany: true, required: true, defaultValue: ['supporter'], options: MEMBER_ROLES.map((value) => ({ label: ROLE_LABELS[value], value })), admin: { description: 'One person can have several roles.' } },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'active', index: true, options: MEMBER_STATUSES.map((value) => ({ label: value === 'active' ? 'Active' : 'Past member', value })), admin: { description: 'Choose Past member for someone who has left. Their links stop working and they drop off mailing lists.' } },
    { name: 'membershipSince', label: 'Member since', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'lifeMemberSince', label: 'Life member since (year)', type: 'number', min: 1800, max: 2200, admin: { step: 1 } },
    {
      name: 'email',
      label: 'Email',
      type: 'text',
      index: true,
      maxLength: 254,
      validate: (value: unknown) => (value == null || value === '' || (typeof value === 'string' && isValidEmail(value)) ? true : 'That email address does not look right.'),
    },
    { name: 'phone', label: 'Phone', type: 'text', maxLength: 40, validate: noCardNumbers },
    { name: 'addressLine', label: 'Street address', type: 'text', maxLength: 200, admin: { description: 'The labels for these four lines can be renamed in Club office settings.' } },
    { name: 'locality', label: 'Locality', type: 'text', maxLength: 100 },
    { name: 'region', label: 'Region', type: 'text', maxLength: 100 },
    { name: 'postalCode', label: 'Postal code', type: 'text', maxLength: 20 },
    { name: 'dateOfBirth', label: 'Date of birth', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' }, description: 'Optional. Used only to know who is under 18.' } },
    { name: 'guardians', label: 'Parents or guardians', type: 'relationship', relationTo: 'members', hasMany: true, admin: { description: 'For a junior without their own email: their parent’s email is used for mail.' } },
    {
      name: 'emergencyContact',
      label: 'Emergency contact',
      type: 'group',
      fields: [
        { name: 'name', label: 'Name', type: 'text', maxLength: 100 },
        { name: 'phone', label: 'Phone', type: 'text', maxLength: 40, validate: noCardNumbers },
        { name: 'relationship', label: 'Relationship', type: 'text', maxLength: 60 },
      ],
    },
    { name: 'doNotEmail', label: 'Do not email', type: 'checkbox', defaultValue: false, admin: { description: 'Tick when this person has asked not to get club emails.' } },
    {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      maxLength: 2000,
      validate: noCardNumbers,
      admin: { description: 'Do not record medical details here. Never type card numbers.' },
    },
    { name: 'erasedAt', label: 'Personal details removed on', type: 'date', access: serverOwnedAccess, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'importedFrom', label: 'Added by', type: 'select', defaultValue: 'manual', options: IMPORT_SOURCES.map((value) => ({ label: value, value })), admin: { position: 'sidebar', readOnly: true } },
    { name: 'volunteerLinkVersion', type: 'number', defaultValue: 0, access: serverOwnedAccess, hooks: { beforeChange: [bumpLinkVersion] }, admin: { hidden: true, readOnly: true } },
  ]),
}
