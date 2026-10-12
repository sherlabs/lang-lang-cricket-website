import type { GlobalConfig } from 'payload'
import { isAdmin, isAdminField } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { DEFAULT_ADDRESS_LABELS } from '../../lib/office/settings-defaults'
import { OFFICE_CURRENCY, OFFICE_LOCALE } from '../../config/site'

const admin = { read: isAdminField, create: isAdminField, update: isAdminField } as const

/**
 * Club office settings (wave D spec section 3.1). Admin only, under Advanced. Nothing here is club specific: the currency and
 * locale start from `OFFICE_CURRENCY` / `OFFICE_LOCALE` (config/site.ts) as function defaults, so no club value lands in a migration,
 * and the four address labels are neutral words the club renames to its own. Editors read only the non-sensitive values, through
 * `lib/office/settings-server.ts`.
 */
export const OfficeSettings: GlobalConfig = {
  slug: 'office-settings',
  label: 'Club office settings',
  admin: {
    group: false,
    hidden: hiddenFromEditors,
    description: 'Currency, language and the names of the address lines used in the club office exports. Later modules add their own settings here.',
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    { name: 'currency', label: 'Currency', type: 'text', maxLength: 3, defaultValue: () => OFFICE_CURRENCY, access: admin, admin: { description: 'A three-letter code such as AUD, NZD, GBP or USD.', width: '50%' } },
    { name: 'locale', label: 'Language and region for dates and amounts', type: 'text', maxLength: 20, defaultValue: () => OFFICE_LOCALE, access: admin, admin: { description: 'For example en-AU, en-GB or en-US.', width: '50%' } },
    {
      name: 'chargeFillIns',
      label: 'Charge fill-in players match fees',
      type: 'checkbox',
      defaultValue: false,
      access: admin,
      admin: { description: 'Off by default: a player who fills in for a game pays only if they are a registered player. Tick to charge every fill-in the per-game rate of their membership.' },
    },
    {
      name: 'addressLabels',
      label: 'Names of the address lines',
      type: 'group',
      access: admin,
      admin: { description: 'What each address line is called where you live. These words are the column names in the members spreadsheet you download. The form on the member page keeps its standard wording.' },
      fields: [
        { name: 'addressLine', label: 'First line', type: 'text', maxLength: 60, defaultValue: DEFAULT_ADDRESS_LABELS.addressLine, access: admin },
        { name: 'locality', label: 'Second line', type: 'text', maxLength: 60, defaultValue: DEFAULT_ADDRESS_LABELS.locality, access: admin },
        { name: 'region', label: 'Third line', type: 'text', maxLength: 60, defaultValue: DEFAULT_ADDRESS_LABELS.region, access: admin },
        { name: 'postalCode', label: 'Postal code line', type: 'text', maxLength: 60, defaultValue: DEFAULT_ADDRESS_LABELS.postalCode, access: admin },
      ],
    },
  ],
}
