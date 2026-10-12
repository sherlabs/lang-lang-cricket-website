import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { getSocialSettings } from '@/lib/social-queries'
import { GRAPHICS } from '@/lib/social/registry'
import { slugify } from '@/lib/slugify'
import { TEXT_FIELDS } from '@/lib/social/text-fields'
import { isGraphicType, isSizeKey, isStyleKey, TYPE_KEYS } from '@/lib/social/types'
import { isStaffUser } from '../access'
import { AdminPage, requireUser } from './AdminPage'
import { SocialComposer } from './SocialComposer'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/**
 * `/admin/social` (custom view, admin and editor): make a picture and a caption for Facebook, Instagram or X. Three steps on one
 * page: pick a graphic, preview it (one size at a time), then share, download or copy the caption. The choice lives in the address
 * (`?type=&source=&style=&size=`), so a refresh keeps it. Reads settings after the staff check; the pictures come from the route.
 */
export async function SocialView(view: AdminViewServerProps) {
  requireUser(view, '/social')
  const { req } = view.initPageResult
  if (!isStaffUser(req.user)) {
    return (
      <AdminPage view={view}>
        <h1 className="club-page__title">Social posts</h1>
        <p className="club-page__lead">Only the committee can make social posts.</p>
      </AdminPage>
    )
  }
  const sp = view.searchParams ?? {}
  const [settings, club] = await Promise.all([getSocialSettings(), getClub()])
  const type = first(sp.type)
  const style = first(sp.style)
  const size = first(sp.size)
  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Social posts' }]} />
      <h1 className="club-page__title">Social posts</h1>
      <p className="club-page__lead">Make a picture and a caption for Facebook, Instagram or X. Pick what to post, check the preview, then save the picture or share it straight from your phone.</p>
      <SocialComposer
        api={`${req.payload.config.routes.api}/admin/social`}
        types={TYPE_KEYS.map((key) => ({ key, label: GRAPHICS[key].spec.label, hint: GRAPHICS[key].spec.hint, textField: TEXT_FIELDS[key] ?? null }))}
        defaultStyle={settings.defaultStyle}
        settings={{ hashtags: settings.hashtags, signOff: settings.signOff, templates: settings.captionTemplates }}
        filePrefix={EXPORT_FILENAME_PREFIX || slugify(club.shortName || club.name) || 'club'}
        initial={{ type: isGraphicType(type) ? type : '', source: first(sp.source).slice(0, 160), style: isStyleKey(style) ? style : null, size: isSizeKey(size) ? size : 'square', text: first(sp.text).slice(0, 80) }}
      />
    </AdminPage>
  )
}
