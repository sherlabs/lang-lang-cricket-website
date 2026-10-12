import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload, TypedUser } from 'payload'
import { CLUB_TIMEZONE } from '@/config/site'
import { getClub } from '@/lib/club'
import { getSocialSettings } from '@/lib/social-queries'
import { configuredNetworks } from './adapters'
import { composeFinalText, validateCaption } from './final-text'
import { GUEST_NAME } from './filters'
import { captionFor, loadGraphic } from './pipeline'
import { playerNamesIn, postTitle, validatePostInput, type PostInput, type PostSpec } from './post-spec'
import { REASONS } from './reasons'
import { checkScheduleTime, resolveWindow } from './schedule-time'
import { SITE_URL_BLOCK, isPublicHttpsUrl } from './site-url'
import { clubToday, loadSocialPlayers } from './sources/shared'
import { derivePostStatus } from './status'
import { targetFacts } from './publisher'
import { GRAPHICS } from './registry'
import { WITHHELD_NAME } from '@/lib/teams-queries'
import type { SocialEnv } from '@/lib/social/adapters/types'

type Row = Record<string, unknown>
const rows = async (payload: Payload, q: ReturnType<typeof sql>): Promise<Row[]> => ((await payload.db.drizzle.execute(q)) as unknown as { rows: Row[] }).rows

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Match the names a picture shows to visible players, and remember who they were. A guest or withheld name is not a player. */
async function snapshotPlayers(type: PostSpec['type'], data: unknown): Promise<PostSpec['snapshot']['players']> {
  const names = playerNamesIn(type, data, [GUEST_NAME, WITHHELD_NAME])
  if (names.length === 0) return []
  const players = await loadSocialPlayers(clubToday())
  return [...players.values()].filter((p) => names.includes(p.name)).map((p) => ({ id: p.id, name: p.name, version: p.version }))
}

const asNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Pause (back to draft): only while no network has been tried. Clears the approval, bumps the revision, discards the frozen words. */
export async function pausePost(payload: Payload, id: number): Promise<Result> {
  const paused = await rows(payload, sql`
    UPDATE "payload"."social_posts"
    SET status = 'draft', approved_by_id = NULL, approved_at = NULL, revision = revision + 1, next_run_at = NULL
    WHERE id = ${id} AND status = 'scheduled'
      AND NOT EXISTS (SELECT 1 FROM "payload"."social_post_targets" t WHERE t.post_id = ${id} AND t.status <> 'pending')
    RETURNING id`)
  if (paused.length !== 1) return fail('This post is being sent, or part of it has already been tried, so it cannot be paused. Wait for it to finish, then retry or mark it as posted.')
  await rows(payload, sql`
    UPDATE "payload"."social_post_targets" SET final_text = NULL, attempts = 0, next_attempt_at = NULL, last_error = NULL, error_code = NULL
    WHERE post_id = ${id} RETURNING id`)
  return { ok: true }
}

export type SaveOptions = { env?: SocialEnv; now?: Date }

/**
 * Save a draft or schedule a post. Scheduling is the human approval: only this function moves a post to `scheduled`, the staff
 * member and time come from the session and the server, and the words that will go out are composed here, once, and frozen on
 * each target. Everything the form says about status, creator or approver is ignored.
 */
export async function savePost(payload: Payload, user: TypedUser, raw: unknown, mode: 'draft' | 'schedule', o: SaveOptions = {}): Promise<Result<{ id: number }>> {
  const env = o.env ?? process.env
  const now = o.now ?? new Date()
  const checked = validatePostInput(raw)
  if (!checked.ok) return checked
  const input: PostInput = checked.value
  const loaded = await loadGraphic(input.type, { source: input.source, ...(input.text ? { text: input.text } : {}) })
  if (!loaded) return fail('That picture could not be made. The game, player or event may have changed, so pick it again.')
  const [settings, club] = await Promise.all([getSocialSettings(), getClub()])
  const style = input.style ?? settings.defaultStyle

  const available = configuredNetworks(env)
  let at: Date | null = null
  let finals: (string | null)[] = input.targets.map(() => null)
  if (mode === 'schedule') {
    if (input.targets.length === 0) return fail('Pick at least one network.')
    if (!isPublicHttpsUrl(club.siteUrl, env)) return fail(SITE_URL_BLOCK)
    const time = checkScheduleTime({ date: input.date, time: input.time, tz: CLUB_TIMEZONE, now, window: resolveWindow(settings.publishWindow), allowOutside: input.allowOutside })
    if (!time.ok) return fail(time.error)
    at = time.at
    const errors: string[] = []
    finals = input.targets.map((t) => {
      const adapter = available.find((a) => a.id === t.network)
      if (!adapter) { errors.push(`${t.network === 'mock' ? 'The Test network' : t.network} is not available for scheduling.`); return null }
      if (!adapter.sizes.includes(t.size)) { errors.push(`${adapter.label} does not take the ${t.size} size.`); return null }
      const text = composeFinalText({ body: input.caption, signOff: settings.signOff, hashtags: input.hashtags, limits: adapter.limits })
      errors.push(...validateCaption(adapter.id, text, adapter.limits, adapter.label).errors)
      return text
    })
    if (errors.length) return fail(errors[0])
  } else if (input.date && input.time) {
    const t = checkScheduleTime({ date: input.date, time: input.time, tz: CLUB_TIMEZONE, now: new Date(0), window: { earliest: '00:00', latest: '23:59' }, allowOutside: true })
    at = t.ok ? t.at : null
  }

  const g = GRAPHICS[input.type]
  const params = loaded.params as Record<string, unknown>
  const players = await snapshotPlayers(input.type, loaded.data)
  const spec: PostSpec = {
    type: input.type,
    style,
    raw: { source: input.source, ...(input.text ? { text: input.text } : {}) },
    snapshot: { data: loaded.data, players },
    playerIds: players.map((p) => p.id),
    sponsorIds: Array.isArray(params.ids) ? (params.ids as unknown[]).filter((x): x is number => typeof x === 'number') : [],
    ...(asNumber(params.eventId) !== undefined ? { eventId: asNumber(params.eventId) } : {}),
    ...(typeof params.gameId === 'string' ? { gameId: params.gameId } : {}),
  }
  const caption = input.caption || (await captionFor(loaded)).text
  const title = postTitle(g.spec.label, g.spec.describe(loaded.data))
  const data = { title, spec, caption, hashtags: input.hashtags, scheduledFor: at ? at.toISOString() : null }

  let id = input.id
  if (id !== null) {
    const found = await rows(payload, sql`SELECT status FROM "payload"."social_posts" WHERE id = ${id}`)
    if (found.length === 0) return fail('That post no longer exists.')
    if (found[0].status === 'scheduled') {
      const paused = await pausePost(payload, id)
      if (!paused.ok) return paused
    } else if (found[0].status !== 'draft') {
      return fail('A post that has been sent or is being sent cannot be edited. Make a new one instead.')
    }
    await payload.update({ collection: 'social-posts', id, data: data as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } })
    await rows(payload, sql`UPDATE "payload"."social_posts" SET revision = revision + 1 WHERE id = ${id} AND status = 'draft' RETURNING id`)
    await rows(payload, sql`DELETE FROM "payload"."social_post_targets" WHERE post_id = ${id} RETURNING id`)
  } else {
    const created = await payload.create({ collection: 'social-posts', data: { ...data, createdBy: user.id } as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } })
    id = created.id
  }
  for (const [i, t] of input.targets.entries()) {
    await payload.create({ collection: 'social-post-targets', data: { post: id, network: t.network, size: t.size, finalText: finals[i], status: 'pending', attempts: 0 } as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } })
  }
  if (mode === 'schedule' && at) {
    const flipped = await rows(payload, sql`
      UPDATE "payload"."social_posts"
      SET status = 'scheduled', approved_by_id = ${user.id}, approved_at = now(), next_run_at = ${at.toISOString()}::timestamptz, finished_at = NULL
      WHERE id = ${id} AND status = 'draft' RETURNING id`)
    if (flipped.length !== 1) return fail('Could not schedule that post. Please try again.')
  }
  return { ok: true, id }
}

/** Recompute a post's state from its targets after a person resolves one. Never touches a post that is being sent. */
async function recompute(payload: Payload, postId: number): Promise<void> {
  const facts = await targetFacts(payload, postId)
  const d = derivePostStatus(facts, new Date())
  await rows(payload, sql`
    UPDATE "payload"."social_posts"
    SET status = ${d.status}, next_run_at = ${d.nextRunAt ? d.nextRunAt.toISOString() : null}::timestamptz,
        finished_at = CASE WHEN ${d.status === 'scheduled'} THEN finished_at ELSE now() END
    WHERE id = ${postId} AND status IN ('failed', 'scheduled') RETURNING id`)
}

/** Retry: every failed target goes back to pending with a fresh count; posted targets are never re-sent. Unknown ones must be checked by hand first. */
export async function retryPost(payload: Payload, user: TypedUser, id: number): Promise<Result> {
  const post = (await rows(payload, sql`SELECT status, approved_by_id FROM "payload"."social_posts" WHERE id = ${id}`))[0]
  if (!post || post.status !== 'failed') return fail('Only a post that did not go out can be retried.')
  const pending = await rows(payload, sql`SELECT status FROM "payload"."social_post_targets" WHERE post_id = ${id}`)
  if (pending.some((t) => t.status === 'unknown')) return fail('Check the page first. Then choose "I checked, it did not go out" or "Mark as posted".')
  // The original approval must still stand; if that person has left the committee, the person retrying approves it again.
  const approver = post.approved_by_id == null ? null : await payload.findByID({ collection: 'users', id: Number(post.approved_by_id), depth: 0, overrideAccess: true }).catch(() => null)
  const { isStaffUser } = await import('@/payload/access')
  const keep = isStaffUser(approver)
  const res = await rows(payload, sql`
    WITH p AS (
      UPDATE "payload"."social_posts"
      SET status = 'scheduled', next_run_at = now(), finished_at = NULL,
          approved_by_id = CASE WHEN ${keep} THEN approved_by_id ELSE ${user.id}::int END,
          approved_at = CASE WHEN ${keep} THEN approved_at ELSE now() END
      WHERE id = ${id} AND status = 'failed'
        AND NOT EXISTS (SELECT 1 FROM "payload"."social_post_targets" WHERE post_id = ${id} AND status = 'unknown')
      RETURNING id)
    UPDATE "payload"."social_post_targets" SET status = 'pending', attempts = 0, next_attempt_at = NULL, last_error = NULL, error_code = NULL
    WHERE post_id IN (SELECT id FROM p) AND status = 'failed' RETURNING id`)
  return res.length > 0 ? { ok: true } : fail('Nothing to retry.')
}

export async function markTargetPosted(payload: Payload, targetId: number): Promise<Result> {
  const res = await rows(payload, sql`
    UPDATE "payload"."social_post_targets" SET status = 'published', manual = true, remote_id = 'manual', published_at = now(), last_error = NULL, error_code = NULL, next_attempt_at = NULL
    WHERE id = ${targetId} AND status IN ('failed', 'unknown')
      AND post_id IN (SELECT id FROM "payload"."social_posts" WHERE status <> 'publishing')
    RETURNING post_id`)
  if (res.length !== 1) return fail('That network cannot be marked as posted right now.')
  await recompute(payload, Number(res[0].post_id))
  return { ok: true }
}

/** "I checked, it did not go out": an unknown target becomes failed, so Retry can send it. */
export async function markTargetNotPosted(payload: Payload, targetId: number): Promise<Result> {
  const res = await rows(payload, sql`
    UPDATE "payload"."social_post_targets" SET status = 'failed', error_code = 'checked_not_posted', last_error = ${REASONS.checked_not_posted}
    WHERE id = ${targetId} AND status = 'unknown' AND post_id IN (SELECT id FROM "payload"."social_posts" WHERE status <> 'publishing')
    RETURNING post_id`)
  if (res.length !== 1) return fail('That network cannot be changed right now.')
  await recompute(payload, Number(res[0].post_id))
  return { ok: true }
}

/** Delete a draft, a posted row or a failed one. A scheduled post must be paused first. */
export async function deletePost(payload: Payload, id: number): Promise<Result> {
  await rows(payload, sql`
    DELETE FROM "payload"."social_post_targets"
    WHERE post_id = ${id} AND EXISTS (SELECT 1 FROM "payload"."social_posts" WHERE id = ${id} AND status IN ('draft', 'published', 'failed')) RETURNING id`)
  const gone = await rows(payload, sql`DELETE FROM "payload"."social_posts" WHERE id = ${id} AND status IN ('draft', 'published', 'failed') RETURNING id`)
  return gone.length === 1 ? { ok: true } : fail('A scheduled post must be paused before it can be deleted.')
}
