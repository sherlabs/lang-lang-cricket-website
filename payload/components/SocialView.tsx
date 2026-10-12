import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { CLUB_LOCALE, CLUB_TIMEZONE, EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { listQueue, getSocialSettings } from '@/lib/social-queries'
import { configuredNetworks, unavailableNetworks } from '@/lib/social/adapters'
import { readHeartbeat } from '@/lib/social/heartbeat'
import { heartbeatView, overdueAfterMinutes } from '@/lib/social/heartbeat-math'
import { toRow } from '@/lib/social/queue-rows'
import { isTab, type Tab } from '@/lib/social/queue-view'
import { GRAPHICS } from '@/lib/social/registry'
import { utcToClubParts } from '@/lib/social/schedule-time'
import { isPublicHttpsUrl } from '@/lib/social/site-url'
import { slugify } from '@/lib/slugify'
import { TEXT_FIELDS } from '@/lib/social/text-fields'
import { isGraphicType, isSizeKey, isStyleKey, TYPE_KEYS, type SizeKey } from '@/lib/social/types'
import { isStaffUser } from '../access'
import { AdminPage, requireUser } from './AdminPage'
import { SocialComposer } from './SocialComposer'
import { SocialQueue } from './SocialQueue'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const NETWORK_LABELS: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', mock: 'Test network' }

/**
 * `/admin/social` (custom view, admin and editor): make a picture and a caption for Facebook, Instagram or X, then post it by hand
 * or schedule it. Four steps on one page: pick a graphic, preview it (one size at a time), use it, schedule it; the queue sits
 * below. The choice lives in the address (`?type=&source=&style=&size=`), so a refresh keeps it; `?post=<id>` edits a saved post.
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
  const [settings, club, queue, beat] = await Promise.all([getSocialSettings(), getClub(), listQueue(), readHeartbeat(req.payload, overdueAfterMinutes)])
  const now = new Date()
  const clock = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, hour: 'numeric', minute: '2-digit' })
  const whenFmt = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const networks = configuredNetworks(process.env)
  const available = new Set(networks.map((n) => n.id))
  const rows = queue.map((p) => toRow(p, { labels: NETWORK_LABELS, available, clock: (iso) => clock.format(new Date(iso)), when: (iso) => whenFmt.format(new Date(iso)) }))
  const heartbeat = heartbeatView({ ...beat, now })

  const editId = Number(first(sp.post))
  const editing = Number.isInteger(editId) && editId > 0 ? queue.find((p) => p.id === editId && (p.status === 'draft' || p.status === 'scheduled')) : undefined
  const type = editing?.type ?? first(sp.type)
  const style = editing?.style ?? first(sp.style)
  const size = editing?.targets[0]?.size ?? first(sp.size)
  const when = editing?.scheduledFor ? utcToClubParts(new Date(editing.scheduledFor), CLUB_TIMEZONE) : null
  const tomorrow = utcToClubParts(new Date(now.getTime() + 86_400_000), CLUB_TIMEZONE).date
  const tab = first(sp.tab)
  const initialTab: Tab = isTab(tab) ? tab : rows.some((r) => r.tab === 'attention') ? 'attention' : 'scheduled'

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Social posts' }]} />
      <h1 className="club-page__title">Social posts</h1>
      <p className="club-page__lead">Make a picture and a caption for Facebook, Instagram or X. Pick what to post, check the preview, then save the picture, share it straight from your phone, or schedule it.</p>
      <SocialComposer
        api={`${req.payload.config.routes.api}/admin/social`}
        types={TYPE_KEYS.map((key) => ({ key, label: GRAPHICS[key].spec.label, hint: GRAPHICS[key].spec.hint, textField: TEXT_FIELDS[key] ?? null }))}
        defaultStyle={settings.defaultStyle}
        settings={{ hashtags: settings.hashtags, signOff: settings.signOff, templates: settings.captionTemplates }}
        filePrefix={EXPORT_FILENAME_PREFIX || slugify(club.shortName || club.name) || 'club'}
        initial={{ type: isGraphicType(type) ? type : '', source: (editing?.source ?? first(sp.source)).slice(0, 160), style: isStyleKey(style) ? style : null, size: isSizeKey(size) ? (size as SizeKey) : 'square', text: (editing?.text ?? first(sp.text)).slice(0, 80) }}
        scheduling={{
          networks: networks.map((n) => ({ id: n.id, label: n.label, sizes: [...n.sizes], maxChars: n.limits.maxChars, maxHashtags: n.limits.maxHashtags })),
          unavailable: unavailableNetworks(process.env).map((n) => ({ id: n.id, label: n.label })),
          siteUrlOk: isPublicHttpsUrl(club.siteUrl),
          tz: CLUB_TIMEZONE,
          locale: CLUB_LOCALE,
          window: settings.publishWindow,
          defaultDate: tomorrow,
          heartbeat,
          edit: editing
            ? {
                id: editing.id, status: editing.status, caption: editing.caption, hashtags: editing.hashtags,
                targets: editing.targets.filter((t) => ['facebook', 'instagram', 'x', 'mock'].includes(t.network) && isSizeKey(t.size)).map((t) => ({ network: t.network as 'mock', size: t.size as SizeKey })),
                date: when?.date ?? '', time: when?.time ?? '',
              }
            : null,
        }}
      />
      <SocialQueue api={`${req.payload.config.routes.api}/admin/social`} rows={rows} initialTab={initialTab} heartbeat={heartbeat} editBase={`${req.payload.config.routes.admin}/social?post=`} />
    </AdminPage>
  )
}
