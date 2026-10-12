import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { resolveSocialSettings, type SocialSettings } from '@/lib/social/settings'
import { TIER_ORDER } from '@/lib/sponsors'
import { loadImageDataUri } from '@/lib/theme/og'

/** The social-settings global with every gap filled (never throws: a graphic must still render if the read fails). */
export async function getSocialSettings(): Promise<SocialSettings> {
  try {
    const payload = await getPayloadClient()
    const doc = await payload.findGlobal({ slug: 'social-settings', depth: 0, overrideAccess: true })
    return resolveSocialSettings(doc)
  } catch (err) {
    console.warn('[social] settings unavailable, using defaults:', (err as Error).message)
    return resolveSocialSettings(null)
  }
}

/**
 * Sponsor logos for the footer strip: the tiers in the settings, in tier then sort order, up to `max`. A logo that is not a
 * PNG or JPG, or that cannot be fetched in time, is skipped; with none left the strip is simply absent.
 */
export async function sponsorsForStrip(settings: SocialSettings): Promise<{ src: string; name: string }[]> {
  if (!settings.sponsorStrip.show || settings.sponsorStrip.tiers.length === 0) return []
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'sponsors',
    where: { tier: { in: settings.sponsorStrip.tiers } },
    pagination: false,
    depth: 1,
    overrideAccess: true,
  })
  const ordered = docs
    .filter((d) => typeof d.logo === 'object' && d.logo !== null && Boolean(d.logo.url))
    .sort((a, b) => TIER_ORDER.indexOf(a.tier as (typeof TIER_ORDER)[number]) - TIER_ORDER.indexOf(b.tier as (typeof TIER_ORDER)[number]) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
    .slice(0, settings.sponsorStrip.max)
  const loaded = await Promise.all(
    ordered.map(async (d) => {
      const logo = d.logo as { url?: string | null; updatedAt?: string }
      const src = await loadImageDataUri(logo.url ?? '', logo.updatedAt ?? '')
      return src ? { src, name: d.name } : null
    }),
  )
  return loaded.filter((x): x is { src: string; name: string } => x !== null)
}

/** True when the strip is switched on and has logos configured but none could be drawn (the composer hints at PNG or JPG). */
export const stripHint = 'Sponsor logos need to be PNG or JPG to appear on pictures.'

// ---- The posting queue (wave C spec 4.4, 4.8). Staff-only callers; nothing here is reachable without a staff check. ----

export type QueueTarget = {
  id: number
  network: string
  size: string
  status: string
  attempts: number
  nextAttemptAt: string | null
  errorCode: string | null
  lastError: string | null
  manual: boolean
  finalText: string
  remoteUrl: string | null
}
export type QueuePost = {
  id: number
  title: string
  status: string
  caption: string
  hashtags: string[]
  scheduledFor: string | null
  nextRunAt: string | null
  finishedAt: string | null
  type: string
  style: string
  source: string
  text: string
  targets: QueueTarget[]
}

const iso = (v: unknown): string | null => (v ? new Date(String(v)).toISOString() : null)

/**
 * The posts for the queue tabs, newest first, with their per-network targets. An explicit `select` keeps the lease fields (and the
 * picture snapshot, which is large) out of what the page receives.
 */
export async function listQueue(limit = 100): Promise<QueuePost[]> {
  const payload = await getPayloadClient()
  const posts = await payload.find({
    collection: 'social-posts',
    sort: ['-createdAt'],
    limit,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    select: { title: true, status: true, caption: true, hashtags: true, scheduledFor: true, nextRunAt: true, finishedAt: true, spec: true },
  })
  if (posts.docs.length === 0) return []
  const targets = await payload.find({
    collection: 'social-post-targets',
    where: { post: { in: posts.docs.map((p) => p.id) } },
    sort: 'id',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { post: true, network: true, size: true, status: true, attempts: true, nextAttemptAt: true, errorCode: true, lastError: true, manual: true, finalText: true, remoteUrl: true },
  })
  const byPost = new Map<number, QueueTarget[]>()
  for (const t of targets.docs) {
    const post = typeof t.post === 'object' ? t.post.id : t.post
    const list = byPost.get(post) ?? []
    list.push({
      id: t.id, network: t.network, size: t.size, status: t.status, attempts: Number(t.attempts ?? 0), nextAttemptAt: iso(t.nextAttemptAt), errorCode: t.errorCode ?? null,
      lastError: t.lastError ?? null, manual: t.manual === true, finalText: t.finalText ?? '', remoteUrl: t.remoteUrl ?? null,
    })
    byPost.set(post, list)
  }
  return posts.docs.map((p) => {
    const spec = (p.spec ?? {}) as { type?: string; style?: string; raw?: { source?: string; text?: string } }
    return {
      id: p.id, title: p.title, status: p.status, caption: p.caption ?? '', hashtags: Array.isArray(p.hashtags) ? (p.hashtags as unknown[]).filter((h): h is string => typeof h === 'string') : [],
      scheduledFor: iso(p.scheduledFor), nextRunAt: iso(p.nextRunAt), finishedAt: iso(p.finishedAt), type: spec.type ?? '', style: spec.style ?? '', source: spec.raw?.source ?? '', text: spec.raw?.text ?? '',
      targets: byPost.get(p.id) ?? [],
    }
  })
}

/** Counts for the Home page lines: posts that did not go out, posts due today, and posts overdue (spec 4.8). One grouped query. */
export async function socialCounts(clubDayEnd: Date, overdueAfterMinutes: number): Promise<{ failed: number; dueSoon: number; overdue: number }> {
  const { sql } = await import('@payloadcms/db-postgres/drizzle')
  const payload = await getPayloadClient()
  const res = (await payload.db.drizzle.execute(sql`
    SELECT count(*) FILTER (WHERE status = 'failed')::int AS failed,
           count(*) FILTER (WHERE status = 'scheduled' AND next_run_at <= ${clubDayEnd.toISOString()}::timestamptz)::int AS due_soon,
           count(*) FILTER (WHERE status = 'scheduled' AND next_run_at < now() - make_interval(mins => ${overdueAfterMinutes}::int))::int AS overdue
    FROM "payload"."social_posts"`)) as unknown as { rows: Record<string, number>[] }
  const r = res.rows[0] ?? {}
  return { failed: Number(r.failed ?? 0), dueSoon: Number(r.due_soon ?? 0), overdue: Number(r.overdue ?? 0) }
}
