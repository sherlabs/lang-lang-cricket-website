import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { buildImportedBundle } from '@/lib/history-import/bundle'
import { importedGameId, type ImportedGame, type MatchPlayerRow } from '@/lib/history-import/match-rows'
import { matchTables } from '@/lib/match-store/db'
import { writeBundle } from '@/lib/match-store/write'
import { playerTables } from '@/lib/players/db'
import type { PostSpec } from '@/lib/social/post-spec'
import { FIXTURE_DATA } from '../helpers/social-fixtures'
import { resetMatches } from './match-helpers'
import { makePlayer } from './selection-helpers'

const CTX = { disableRevalidate: true } as const

type Rows = { rows: Record<string, unknown>[] }
export const q = async (payload: Payload, query: ReturnType<typeof sql>) => ((await payload.db.drizzle.execute(query)) as unknown as Rows).rows

export async function resetQueue(payload: Payload): Promise<void> {
  await payload.db.drizzle.execute(sql.raw('DELETE FROM "payload"."social_post_targets"; DELETE FROM "payload"."social_posts"; DELETE FROM "payload"."throttle_hits"'))
}

/** A spec with a self-contained snapshot (no network, no players) that the renderer can draw. */
export function plainSpec(over: Partial<PostSpec> = {}): PostSpec {
  return {
    type: 'sponsor-thanks',
    style: 'bold',
    raw: { source: '1' },
    snapshot: { data: FIXTURE_DATA['sponsor-thanks'], players: [] },
    playerIds: [],
    sponsorIds: [],
    ...over,
  }
}

export type TargetSeed = { network?: string; size?: string; status?: string; attempts?: number; finalText?: string | null; nextAttemptAt?: string | null }

/** A queued post inserted directly (the access override lets the test set server-owned fields). */
export async function insertPost(payload: Payload, o: { status?: string; approvedBy?: number | null; nextRunAt?: string | null; spec?: PostSpec; targets?: TargetSeed[]; title?: string; scheduledFor?: string | null } = {}) {
  const post = await payload.create({
    collection: 'social-posts',
    data: {
      title: o.title ?? 'Test post', status: o.status ?? 'scheduled', spec: (o.spec ?? plainSpec()) as never, caption: 'Hello', hashtags: [],
      scheduledFor: o.scheduledFor ?? o.nextRunAt ?? new Date(Date.now() - 60_000).toISOString(), nextRunAt: o.status === 'draft' ? null : (o.nextRunAt ?? new Date(Date.now() - 60_000).toISOString()),
      approvedBy: o.approvedBy ?? undefined, approvedAt: o.approvedBy ? new Date().toISOString() : undefined, revision: 1,
    } as never,
    overrideAccess: true, depth: 0, context: CTX,
  })
  const targets: number[] = []
  for (const t of o.targets ?? [{}]) {
    const created = await payload.create({
      collection: 'social-post-targets',
      data: { post: post.id, network: t.network ?? 'mock', size: t.size ?? 'square', finalText: t.finalText === undefined ? 'Final words #club' : t.finalText, status: t.status ?? 'pending', attempts: t.attempts ?? 0, nextAttemptAt: t.nextAttemptAt ?? undefined } as never,
      overrideAccess: true, depth: 0, context: CTX,
    })
    targets.push(created.id)
  }
  return { id: post.id, targets }
}

export const postRow = async (payload: Payload, id: number) => (await q(payload, sql`SELECT * FROM "payload"."social_posts" WHERE id = ${id}`))[0]
export const targetRows = (payload: Payload, postId: number) => q(payload, sql`SELECT * FROM "payload"."social_post_targets" WHERE post_id = ${postId} ORDER BY id`)

/** Make a post due now / a retry due now, so a second run picks it up. */
export async function makeDue(payload: Payload, postId: number): Promise<void> {
  await q(payload, sql`UPDATE "payload"."social_posts" SET next_run_at = now() - interval '1 minute' WHERE id = ${postId} AND status = 'scheduled' RETURNING id`)
  await q(payload, sql`UPDATE "payload"."social_post_targets" SET next_attempt_at = now() - interval '1 minute' WHERE post_id = ${postId} AND next_attempt_at IS NOT NULL RETURNING id`)
}

/** Visible players with season rows (so the junior rule can read statistics) and one stored game they played in. */
export async function seedPlayersAndGame(payload: Payload) {
  await resetMatches(payload)
  const riley = (await makePlayer(payload, 'Riley', 'Starr')).id
  const jamie = (await makePlayer(payload, 'Jamie', 'Junior', { isJunior: true })).id
  const casey = (await makePlayer(payload, 'Casey', 'Consent', { isJunior: true, socialOptIn: true })).id
  const t = playerTables(payload)
  const stamp = new Date().toISOString()
  for (const [player, runs] of [[riley, 614], [jamie, 702], [casey, 188]] as const) {
    await payload.db.drizzle.insert(t.player_seasons).values({
      player, seasonName: 'Summer 2025/26', seasonOrder: 0, teamId: 'team-b', teamName: 'Test B', gradeName: 'B Grade', games: 10, batInnings: 10, batRuns: runs, batHighScore: 112, batBalls: runs * 2,
      bowlBalls: 120, bowlRuns: 90, bowlWickets: 8, createdAt: stamp, updatedAt: stamp,
    })
  }
  const gameId = importedGameId({ date: '2026-10-09', gradeName: 'B Grade', teamName: 'Test B', opponent: 'Rovers', gameRef: null })
  const row = (n: number, first: string, last: string, over: Partial<MatchPlayerRow>): MatchPlayerRow => ({
    row: n, firstName: first, lastName: last, nameKey: `${first}|${last}`.toLowerCase(), batted: true, runs: 0, balls: null, fours: null, sixes: null, howOut: 'bowled',
    bowlBalls: null, maidens: null, runsConceded: null, wickets: null, ...over,
  })
  const game: ImportedGame = {
    gameId, firstRow: 2, date: '2026-10-09', seasonStartYear: 2025, seasonName: 'Summer 2025/26', gradeName: 'B Grade', teamName: 'Test B', teamSlug: 'test-b', opponent: 'Rovers', gameRef: null,
    format: 'one_day', result: 'won', teamRuns: 212, teamWickets: 4, oppRuns: 160, oppWickets: 10,
    players: [
      row(2, 'Riley', 'Starr', { runs: 112, balls: 84, howOut: 'not_out', bowlBalls: 36, runsConceded: 21, wickets: 2 }),
      row(3, 'Jamie', 'Junior', { runs: 61, balls: 58, howOut: 'caught' }),
      row(4, 'Casey', 'Consent', { runs: 14, balls: 20, bowlBalls: 48, runsConceded: 30, wickets: 3 }),
    ],
  }
  await payload.db.drizzle.transaction((tx: unknown) =>
    writeBundle(tx, matchTables(payload), buildImportedBundle(game), new Map([['riley|starr', riley], ['jamie|junior', jamie], ['casey|consent', casey]]), { source: 'import', importBatch: 'imp-social-queue' }),
  )
  return { riley, jamie, casey, gameId }
}
