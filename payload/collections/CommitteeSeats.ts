import type { CollectionConfig } from 'payload'
import { isAdmin, isStaff } from '../access'

/**
 * Committee seats (wave D spec 6.1): the offices of the club (president, secretary and so on). Jobs, actions and diary items are owned
 * by the seat, so they follow it when the holder changes. Everyone on the committee reads the seats; only an admin edits them by hand,
 * and the annual meeting's "Hand over seats" step changes holders (and clears the old holder's login) in one go.
 * `holderUser` is the login that counts as that seat's holder; with `officeBearer` ticked it can open office-bearer documents
 * and restricted minutes. A seat with no login grants no access.
 */
export const CommitteeSeats: CollectionConfig = {
  slug: 'committee-seats',
  labels: { singular: 'Committee seat', plural: 'Committee seats' },
  admin: {
    group: false,
    hideAPIURL: true,
    useAsTitle: 'title',
    defaultColumns: ['title', 'holder', 'officeBearer', 'termEnd'],
    description: 'The offices on your committee. Hand them over at the yearly general meeting from Club office, then Meetings.',
  },
  defaultSort: 'sortOrder',
  disableDuplicate: true,
  access: { read: isStaff, create: isAdmin, update: isAdmin, delete: isAdmin },
  timestamps: true,
  fields: [
    { name: 'title', label: 'Seat', type: 'text', required: true, maxLength: 80, admin: { description: 'For example President or Secretary.' } },
    { name: 'sortOrder', label: 'Order in lists', type: 'number', defaultValue: 100, admin: { width: '25%' } },
    { name: 'holder', label: 'Who holds it', type: 'relationship', relationTo: 'people', admin: { description: 'From Committee & contacts. Leave empty if the seat is vacant.' } },
    {
      name: 'holderUser',
      label: 'Their login',
      type: 'relationship',
      relationTo: 'users',
      filterOptions: { role: { in: ['admin', 'editor'] } },
      admin: { description: 'Only needed if this person signs in to the admin. Selectors cannot hold a seat login.' },
    },
    { name: 'officeBearer', label: 'Office-bearer', type: 'checkbox', defaultValue: false, admin: { description: 'Tick for seats that may open office-bearer documents and restricted minutes (for example president, secretary, treasurer). Needs their login above.' } },
    { name: 'termStart', label: 'Term started', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' }, width: '50%' } },
    { name: 'termEnd', label: 'Term ends', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' }, width: '50%', description: 'Optional. After this date the seat no longer gives access.' } },
    { name: 'handoverNote', label: 'Handover note', type: 'textarea', maxLength: 2000, admin: { description: 'What the next holder should know. Visible to the whole committee, so keep it free of private details.' } },
  ],
}
