import type { GlobalConfig } from 'payload'
import { TIER_ORDER } from '../../lib/sponsors'
import { DEFAULT_SPONSOR_CAROUSEL_TIERS } from '../../lib/site-settings-core'
import { anyone, isStaff } from '../access'
import { revalidatePaths } from '../hooks/revalidate'

/** Site behaviour (spec §4.2). Feature flags are deferred to the template work. */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  admin: { group: 'Settings' },
  access: { read: anyone, update: isStaff },
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        await revalidatePaths(['/', '/sponsors'], req.context)
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'sponsorCarouselTiers',
      label: 'Sponsor carousel tiers',
      type: 'select',
      hasMany: true,
      options: [...TIER_ORDER],
      defaultValue: [...DEFAULT_SPONSOR_CAROUSEL_TIERS],
      admin: {
        description: 'Sponsors in these tiers scroll across the home page under the hero. Leave empty to hide the carousel.',
      },
    },
  ],
}
