import type { CollectionBeforeChangeHook } from 'payload'
import { CLUB_COUNTRY } from '../../config/site'
import { normalisePhone } from '../../lib/selection/phone'
import { isSelectionField, nobodyField } from '../access'
import { codeOnlyAccess, selectionCollection } from './selectionCollection'

/** A stored phone is digits in the club's national format; anything else typed over REST or the admin is refused. */
const normalisePhoneHook: CollectionBeforeChangeHook = ({ data }) => {
  if (typeof data.phone === 'string' && data.phone.trim()) {
    const digits = normalisePhone(data.phone, CLUB_COUNTRY)
    if (!digits) throw new Error('That phone number does not look right.')
    data.phone = digits
  } else if ('phone' in data) {
    data.phone = null
  }
  return data
}

/**
 * Private selection details for one player (announce-teams spec 4.2): a phone number (for ringing people and the default PIN
 * of the availability link), the PIN itself (stored only as a salted scrypt hash) and the selectors' own notes on the player.
 * Phones are personal information: field access (not `hidden`, which does not stop a REST filter) keeps them from everyone but
 * admins, editors and selectors; the PIN hash, salt and one-time code are readable and writable by nobody over REST.
 */
export const PlayerSelectionProfiles = selectionCollection({
  slug: 'player-selection-profiles',
  singular: 'Player contact and selection details',
  plural: 'Player contact and selection details',
  description: 'Phone, PIN and selector notes for one player. Managed by the selectors, never shown publicly.',
  defaultColumns: ['player', 'role', 'canKeep'],
  hooks: { beforeChange: [normalisePhoneHook] },
  fields: [
    { name: 'player', type: 'relationship', relationTo: 'players', required: true, unique: true, index: true },
    { name: 'phone', type: 'text', maxLength: 20, access: { read: isSelectionField, create: isSelectionField, update: isSelectionField }, admin: { description: 'Used to ring the player and as the default PIN (last four digits). Never shown publicly.' } },
    { name: 'pinHash', type: 'text', hidden: true, access: codeOnlyAccess },
    { name: 'pinSalt', type: 'text', hidden: true, access: codeOnlyAccess },
    { name: 'pinSource', type: 'select', options: [{ label: 'Last four digits of the phone', value: 'phone' }, { label: 'Set by a selector', value: 'manual' }], access: { create: nobodyField, update: nobodyField } },
    { name: 'pinSetAt', type: 'date', access: { create: nobodyField, update: nobodyField } },
    { name: 'needsManualPin', type: 'checkbox', defaultValue: false, access: { create: nobodyField, update: nobodyField }, admin: { description: 'Set when two players of one name share a PIN, until a selector gives one of them their own.' } },
    { name: 'otcHash', type: 'text', hidden: true, access: codeOnlyAccess },
    { name: 'otcExpiresAt', type: 'date', hidden: true, access: codeOnlyAccess },
    {
      name: 'role',
      type: 'select',
      options: [{ label: 'Batter', value: 'batter' }, { label: 'Bowler', value: 'bowler' }, { label: 'All-rounder', value: 'all-rounder' }, { label: 'Keeper', value: 'keeper' }],
      admin: { description: 'The selectors’ view of the player. Leave empty to let the site guess from the stats.' },
    },
    { name: 'canKeep', type: 'checkbox', defaultValue: false, label: 'Can keep wicket' },
    { name: 'notes', type: 'textarea', maxLength: 1000, admin: { description: 'Private to selectors.' } },
  ],
})
