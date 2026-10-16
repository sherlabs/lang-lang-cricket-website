import { SetStepNav } from '@payloadcms/ui'
import { cache, Suspense } from 'react'
import type { AdminViewServerProps, Payload } from 'payload'
import { CLUB_LOCALE, CLUB_TIMEZONE, EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { listQueue, getSocialSettings } from '@/lib/social-queries'
import { configuredNetworks, unavailableNetworks } from '@/lib/social/adapters'
import { readHeartbeat } from '@/lib/social/heartbeat'
import { heartbeatView, overdueAfterMinutes } from '@/lib/social/heartbeat-math'
import { toRow } from '@/lib/social/queue-rows'
import { isTab, tabOf, type Tab } from '@/lib/social/queue-view'
import { GRAPHICS } from '@/lib/social/registry'
import { utcToClubParts } from '@/lib/social/schedule-time'
import { isPublicHttpsUrl } from '@/lib/social/site-url'
import { slugify } from '@/lib/slugify'
import { TEXT_FIELDS } from '@/lib/social/text-fields'
import { isGraphicType, isSizeKey, isStyleKey, TYPE_KEYS, type SizeKey } from '@/lib/social/types'
import { AdminPage, requireStaff } from './AdminPage'
import { PageHeader, SkeletonRows, StatusPill } from './ui'
import { SocialComposer } from './SocialComposer'
import { SocialQueue } from './SocialQueue'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const NETWORK_LABELS: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', mock: 'Test network' }

const queueOf = cache(() => listQueue())
const heartbeatOf = cache((payload: Payload) => readHeartbeat(payload, overdueAfterMinutes))
const NOW_FORMATS = () => ({
  clock: new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, hour: 'numeric', minute: '2-digit' }),
  when: new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
})

const adminBase = (view: AdminViewServerProps): string => view.initPageResult.req.payload.config.routes.admin

/** The address of a tab: the composer's own choices ride along on "Make a post", so going back from Posts finds the picture again. */
function tabHrefs(view: AdminViewServerProps): { make: string; posts: string } {
  const base = `${adminBase(view)}/social`
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(view.searchParams ?? {})) if (k !== 'tab' && k !== 'status' && typeof v === 'string') q.set(k, v)
  return { make: q.size ? `${base}?${q}` : base, posts: `${base}?tab=posts` }
}

/**
 * `/admin/social` (custom view, admin and editor), two tabs: **Make a post** (the composer: pick a kind, pick what it is about, check the
 * live preview, then download, share, schedule or save a draft) and **Posts** (the queue). The choice lives in the address
 * (`?type=&source=&style=&size=`), so a refresh keeps it; `?post=<id>` edits a saved post; `?tab=posts&status=` opens the queue.
 *
 * The page awaits only the sign-in check before it paints: the heading and the tab bar are immediate, and the composer or the queue
 * streams in as its own region (with a skeleton), so a slow query never leaves the page blank.
 */
export async function SocialView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/social')
  if (denied !== null) return denied
  const tab = first(view.searchParams?.tab) === 'posts' ? 'posts' : 'make'
  const hrefs = tabHrefs(view)
  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Social posts' }]} />
      <PageHeader title="Social posts" lead="Make a picture and a caption for Facebook, Instagram or X. Pick what to post, check the preview, then download it, share it from your phone, or schedule it." />
      <Suspense fallback={<SocialTabs active={tab} hrefs={hrefs} attention={null} />}>
        <TabsRegion active={tab} hrefs={hrefs} />
      </Suspense>
      {tab === 'make' ? (
        <Suspense fallback={<RegionSkeleton name="composer" label="Getting the composer ready" />}>
          <ComposerRegion view={view} postsHref={hrefs.posts} />
        </Suspense>
      ) : (
        <Suspense fallback={<RegionSkeleton name="queue" label="Loading your posts" />}>
          <QueueRegion view={view} makeHref={hrefs.make} />
        </Suspense>
      )}
    </AdminPage>
  )
}

function SocialTabs({ active, hrefs, attention }: { active: 'make' | 'posts'; hrefs: { make: string; posts: string }; attention: number | null }) {
  return (
    <nav aria-label="Social posts" className="social-tabs">
      <a href={hrefs.make} className="social-tabs__item" aria-current={active === 'make' ? 'page' : undefined}>Make a post</a>
      <a href={hrefs.posts} className="social-tabs__item" aria-current={active === 'posts' ? 'page' : undefined}>
        Posts
        {attention ? <StatusPill tone="warn" label={`${attention} need attention`}>{attention}</StatusPill> : null}
      </a>
    </nav>
  )
}

/** The tab bar with the "needs attention" count: it waits for the queue, so the bar paints first without the badge. */
async function TabsRegion({ active, hrefs }: { active: 'make' | 'posts'; hrefs: { make: string; posts: string } }) {
  const queue = await queueOf().catch(() => [])
  const attention = queue.filter((p) => tabOf({ status: p.status, targets: p.targets }) === 'attention').length
  return <SocialTabs active={active} hrefs={hrefs} attention={attention} />
}

function RegionSkeleton({ name, label }: { name: string; label: string }) {
  return (
    <section className="admin-region-skeleton" data-admin-skeleton={name} aria-busy="true">
      <SkeletonRows rows={4} label={label} />
    </section>
  )
}

async function ComposerRegion({ view, postsHref }: { view: AdminViewServerProps; postsHref: string }) {
  const { req } = view.initPageResult
  const sp = view.searchParams ?? {}
  const editId = Number(first(sp.post))
  const wantsEdit = Number.isInteger(editId) && editId > 0
  const [settings, club, beat, queue] = await Promise.all([getSocialSettings(), getClub(), heartbeatOf(req.payload), wantsEdit ? queueOf() : Promise.resolve([])])
  const now = new Date()
  const networks = configuredNetworks(process.env)
  const heartbeat = heartbeatView({ ...beat, now })
  const editing = wantsEdit ? queue.find((p) => p.id === editId && (p.status === 'draft' || p.status === 'scheduled')) : undefined
  const type = editing?.type ?? first(sp.type)
  const style = editing?.style ?? first(sp.style)
  const size = editing?.targets[0]?.size ?? first(sp.size)
  const when = editing?.scheduledFor ? utcToClubParts(new Date(editing.scheduledFor), CLUB_TIMEZONE) : null
  const tomorrow = utcToClubParts(new Date(now.getTime() + 86_400_000), CLUB_TIMEZONE).date

  return (
    <SocialComposer
      api={`${req.payload.config.routes.api}/admin/social`}
      postsHref={postsHref}
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
  )
}

async function QueueRegion({ view, makeHref }: { view: AdminViewServerProps; makeHref: string }) {
  const { req } = view.initPageResult
  const sp = view.searchParams ?? {}
  const [queue, beat] = await Promise.all([queueOf(), heartbeatOf(req.payload)])
  const now = new Date()
  const fmt = NOW_FORMATS()
  const available = new Set(configuredNetworks(process.env).map((n) => n.id))
  const rows = queue.map((p) => toRow(p, { labels: NETWORK_LABELS, available, clock: (iso) => fmt.clock.format(new Date(iso)), when: (iso) => fmt.when.format(new Date(iso)) }))
  const tab = first(sp.status)
  const initialTab: Tab = isTab(tab) ? tab : rows.some((r) => r.tab === 'attention') ? 'attention' : 'scheduled'
  return <div data-admin-region="queue"><SocialQueue api={`${req.payload.config.routes.api}/admin/social`} rows={rows} initialTab={initialTab} heartbeat={heartbeatView({ ...beat, now })} editBase={`${req.payload.config.routes.admin}/social?post=`} makeHref={makeHref} /></div>
}
