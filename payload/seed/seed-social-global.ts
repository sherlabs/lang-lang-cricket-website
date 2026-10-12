import type { Payload } from 'payload'
import { SOCIAL_DEFAULTS } from './social-defaults'

/**
 * Write the `social-settings` global from the club's social voice (`social-defaults.ts`). Used by `seed:club` and `seed:demo`. A saved
 * global (it has `updatedAt`) is left alone unless `force`.
 */
export async function seedSocialGlobal(payload: Payload, opts: { force?: boolean } = {}): Promise<'created' | 'updated' | 'skipped'> {
  const current = await payload.findGlobal({ slug: 'social-settings', depth: 0, overrideAccess: true })
  const exists = Boolean(current?.updatedAt)
  if (exists && !opts.force) return 'skipped'
  await payload.updateGlobal({
    slug: 'social-settings',
    data: {
      defaultStyle: SOCIAL_DEFAULTS.defaultStyle,
      hashtags: SOCIAL_DEFAULTS.hashtags.map((tag) => ({ tag })),
      signOff: SOCIAL_DEFAULTS.signOff,
      captionTemplates: SOCIAL_DEFAULTS.captionTemplates,
    },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  return exists ? 'updated' : 'created'
}
