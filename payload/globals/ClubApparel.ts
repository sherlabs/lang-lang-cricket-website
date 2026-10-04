import type { GlobalConfig } from 'payload'
import { anyone, isStaff } from '../access'
import { httpUrlOrEmpty } from '../fields/validators'
import { revalidatePaths } from '../hooks/revalidate'

import { DEFAULT_APPAREL_LABEL } from '../seed/club-defaults'

/**
 * Link to the club's merchandise shop (outside this site). Its own small global rather than
 * fields on `club`: `club` is admin-only, and the committee must be able to change this link
 * without gaining write access to the rest of the club details. `getClub()` merges it as
 * `club.apparel`; when `apparelUrl` is empty the site renders no apparel button anywhere.
 */
export const ClubApparel: GlobalConfig = {
  slug: 'club-apparel',
  label: 'Club apparel link',
  admin: { group: false, description: 'The link to buy club clothing. Shown as a gold button in the menu, on the home page and in the footer.' },
  access: { read: anyone, update: isStaff },
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        // Nav, footer and home all show it: revalidate the whole root layout, as the club global does.
        await revalidatePaths(['/'], req.context, [], { layout: true })
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'apparelUrl',
      label: 'Shop link',
      type: 'text',
      defaultValue: '',
      validate: httpUrlOrEmpty,
      admin: {
        description: 'Paste the full web address of the shop, starting with https://. Leave empty to hide the apparel button everywhere on the website.',
        placeholder: 'https://shop.example.com/your-club',
      },
    },
    {
      name: 'apparelLabel',
      label: 'Button wording',
      type: 'text',
      defaultValue: DEFAULT_APPAREL_LABEL,
      admin: { description: `The words on the button. If you leave it empty it says "${DEFAULT_APPAREL_LABEL}".` },
    },
    {
      name: 'apparelBlurb',
      label: 'Short line for the home page (optional)',
      type: 'text',
      defaultValue: '',
      admin: { description: 'A sentence to sit beside the button on the home page, for example "Order your playing shirt and club hoodie online."' },
    },
  ],
}
