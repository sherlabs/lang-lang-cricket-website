import { ValidationError, type GlobalConfig } from 'payload'
import { isAdmin, isAdminField } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { DEFAULT_ADDRESS_LABELS, DEFAULT_SHIFT_TYPES } from '../../lib/office/settings-defaults'
import { validateShiftTypes } from '../../lib/office/volunteers'
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
    description: 'Currency, language and the names of the address lines used in the club office exports. The volunteer jobs for the roster live here too. Later modules add their own settings.',
  },
  access: { read: isAdmin, update: isAdmin },
  hooks: {
    // Shift type codes are the identity that shifts and hours point at: a code in use can be renamed but never removed or changed.
    beforeChange: [
      async ({ data, req }) => {
        if (!Array.isArray(data?.shiftTypes)) return data
        const used = new Set<string>()
        for (const collection of ['volunteer-shifts', 'volunteer-hours'] as const) {
          const rows = await req.payload.find({ collection, pagination: false, depth: 0, select: { shiftTypeKey: true }, overrideAccess: true, req })
          for (const r of rows.docs as unknown as { shiftTypeKey?: string | null }[]) if (r.shiftTypeKey) used.add(r.shiftTypeKey)
        }
        const message = validateShiftTypes(data.shiftTypes, [...used])
        if (message) throw new ValidationError({ errors: [{ path: 'shiftTypes', message }] })
        return data
      },
    ],
  },
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
    {
      name: 'shiftTypes',
      label: 'Volunteer jobs',
      type: 'array',
      access: admin,
      defaultValue: DEFAULT_SHIFT_TYPES.map((t) => ({ ...t })),
      admin: { description: 'The jobs you roster on a game day, such as canteen or gate. The code is a short word that never changes once a job has been rostered; the name can be changed at any time. Mark a job “Paid” only if the people doing it are paid: paid and volunteer hours are kept apart in reports.' },
      fields: [
        { name: 'key', label: 'Code', type: 'text', required: true, maxLength: 40, access: admin, admin: { description: 'Lower case letters, numbers and dashes, for example canteen.', width: '25%' } },
        { name: 'label', label: 'Name', type: 'text', required: true, maxLength: 60, access: admin, admin: { width: '25%' } },
        { name: 'defaultHours', label: 'Hours', type: 'number', required: true, min: 0.25, max: 24, defaultValue: 2, access: admin, admin: { width: '15%' } },
        { name: 'defaultSlots', label: 'People needed', type: 'number', required: true, min: 1, max: 50, defaultValue: 1, access: admin, admin: { width: '15%' } },
        {
          name: 'kind',
          label: 'Paid or volunteer',
          type: 'select',
          required: true,
          defaultValue: 'volunteer',
          options: [{ label: 'Volunteer', value: 'volunteer' }, { label: 'Paid', value: 'paid' }],
          access: admin,
          admin: { width: '20%' },
        },
      ],
    },
  ],
}
