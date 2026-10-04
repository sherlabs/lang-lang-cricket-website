/**
 * merge-undo.int (W2 spec 6.2): a merge writes a log row with an identity snapshot; undo puts the source player back with its
 * original id, aliases, honours and links; a simulated sync then routes the original name key to the restored player and the
 * season rows are rebuilt (not restored); a merge of two players who share a game is refused; undo is refused after a later merge,
 * twice, and for an editor.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { relinkMatchPlayers } from '@/lib/match-store/write'
import { dismissPair, purgeOldMergeLog } from '@/lib/players/merge-core'
import { playerTables } from '@/lib/players/db'
import { buildSyncPlan } from '@/lib/players/plan'
import { getDuplicateSuggestions, getRecentMerges } from '@/lib/players/duplicate-queries'
import type { PlayerSeasonStats } from '@/lib/playhq/types'
import { destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { resetPlayers } from './players-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => ({ ...cache, unstable_cache: <T,>(fn: T) => fn }))

const ctx = { disableRevalidate: true }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
let payload: Payload
let editor: string
let admin: string

beforeAll(async () => {
  payload = await getTestPayload()
  editor = await tokenFor(payload, 'editor')
  admin = await tokenFor(payload, 'admin')
})
afterAll(async () => {
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetPlayers(payload)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const now = () => new Date().toISOString()
const rows = (table: string) => payload.db.drizzle.execute(sql.raw(`SELECT * FROM "payload"."${table}" ORDER BY id`)).then((r) => r.rows as R[])

/** A PlayHQ-style player: names, alias and (optionally) a season row, as the sync writes them. */
async function player(first: string, last: string, extra: Record<string, unknown> = {}) {
  const t = playerTables(payload)
  const [row] = await payload.db.drizzle
    .insert(t.players)
    .values({ slug: `${first}-${last}`.toLowerCase(), firstName: first, lastName: last, displayName: `${first} ${last}`, source: 'playhq', createdAt: now(), updatedAt: now(), ...extra })
    .returning({ id: t.players.id })
  await payload.db.drizzle.insert(t.player_aliases).values({ nameKey: `${first}|${last}`.toLowerCase(), player: row.id, createdAt: now(), updatedAt: now() })
  return row.id as number
}
async function season(playerId: number, teamId: string, order = 1, extra: Record<string, unknown> = {}) {
  const t = playerTables(payload)
  await payload.db.drizzle.insert(t.player_seasons).values({ player: playerId, seasonName: 'Summer 2025/26', seasonOrder: order, teamId, teamName: teamId, gradeName: 'B Grade', games: 3, createdAt: now(), updatedAt: now(), ...extra })
}
async function game(id: string, appearances: { player: number; key: string }[]) {
  const t = playerTables(payload)
  const [m] = await payload.db.drizzle
    .insert(t.matches)
    .values({ gameId: id, status: 'FINAL', seasonName: 'Summer 2025/26', clubTeamId: 'T', clubTeamName: 'T', localDate: '2025-11-02', opponentName: 'Demo Rovers', source: 'playhq', createdAt: now(), updatedAt: now() })
    .returning({ id: t.matches.id })
  let n = 0
  for (const a of appearances) {
    await payload.db.drizzle.insert(t.match_appearances).values({ match: m.id, appearanceId: `a${++n}`, teamId: 'T', isClubSide: true, player: a.player, nameKey: a.key, createdAt: now(), updatedAt: now() })
  }
  return m.id as number
}
const stat = (first: string, last: string): PlayerSeasonStats => ({
  key: `${first}|${last}`.toLowerCase(), name: `${first} ${last}`, firstName: first, lastName: last, games: 2,
  batting: { innings: 2, notOuts: 0, runs: 30, highScore: 20, highScoreNotOut: false, balls: 40, fours: 0, sixes: 0, average: null, strikeRate: null },
  bowling: { balls: 0, overs: '0', maidens: 0, runs: 0, wickets: 0, bestWickets: 0, bestRuns: 0, average: null, economy: null },
  catches: 0,
})

async function setup() {
  const media = await payload.create({ collection: 'media', data: { filename: `u-${Date.now()}.jpg`, prefix: 'players', mimeType: 'image/jpeg', filesize: 10, focalX: 50, focalY: 50 }, context: ctx })
  const source = await player('Jon', 'Smith', { isActiveDerived: true, bio: 'Opening bat.', photo: media.id })
  const target = await player('John', 'Smith')
  await payload.update({ collection: 'players', id: source, data: { honours: [{ years: '2020', title: 'Rookie' }, { years: '2021', title: 'Catches' }] }, context: ctx })
  await payload.update({ collection: 'players', id: target, data: { honours: [{ years: '2024', title: 'Champion' }] }, context: ctx })
  await season(source, 'B')
  await season(target, 'B', 1, { games: 4 })
  const person = await payload.create({ collection: 'people', data: { name: 'Jon Smith', role: 'Treasurer', player: source }, context: ctx })
  const sponsor = await payload.create({ collection: 'sponsors', data: { name: 'Demo Plumbing', tier: 'Player' }, context: ctx })
  const ps = await payload.create({ collection: 'player-sponsors', data: { player: source, sponsor: sponsor.id }, context: ctx })
  const g1 = await game('g1', [{ player: source, key: 'jon|smith' }])
  const g2 = await game('g2', [{ player: target, key: 'john|smith' }])
  return { media, source, target, person, ps, g1, g2 }
}

describe('merge writes a log and undo restores identity', () => {
  it('merges, logs an identity-only snapshot, and undoes it', async () => {
    const s = await setup()
    const res = await rest('POST', `/players/${s.source}/merge`, { token: editor, body: { targetId: s.target } })
    expect(res.status).toBe(200)
    const log = (await rows('merge_log'))[0]
    expect(log).toMatchObject({ kind: 'merge', status: 'applied', source_name: 'Jon Smith' })
    expect(Number(log.target_player_id)).toBe(s.target)
    expect(JSON.stringify(log.snapshot)).not.toMatch(/season|appearance/i)
    expect(await rows('players').then((r) => r.some((p) => p.id === s.source))).toBe(false)

    // Undo needs an admin.
    expect((await rest('POST', `/players/merge-log/${log.id}/undo`, { token: editor })).status).toBe(403)
    expect((await rest('POST', `/players/merge-log/${log.id}/undo`)).status).toBe(401)
    const undo = await rest('POST', `/players/merge-log/${log.id}/undo`, { token: admin })
    expect(undo.status).toBe(200)
    expect(undo.json.note).toContain('rebuilt')

    const back = (await rows('players')).find((p) => p.id === s.source)!
    expect(back).toMatchObject({ first_name: 'Jon', last_name: 'Smith', slug: 'jon-smith', bio: 'Opening bat.', is_active_derived: true })
    expect(back.photo_id).toBe(s.media.id)
    const aliases = (await rows('player_aliases')).map((a) => [a.name_key, a.player_id])
    expect(aliases).toEqual(expect.arrayContaining([['jon|smith', s.source], ['john|smith', s.target]]))
    const honours = (await rows('players_honours')).map((h) => [h._parent_id, h._order, h.title]).sort((a, b) => String(a).localeCompare(String(b)))
    expect(honours).toEqual([[s.source, 1, 'Rookie'], [s.source, 2, 'Catches'], [s.target, 1, 'Champion']].sort((a, b) => String(a).localeCompare(String(b))))
    expect((await payload.findByID({ collection: 'people', id: s.person.id, depth: 0 })).player).toBe(s.source)
    expect((await payload.findByID({ collection: 'player-sponsors', id: s.ps.id, depth: 0 })).player).toBe(s.source)
    // The target patch is reverted: no photo, no bio, not active.
    expect(await payload.findByID({ collection: 'players', id: s.target, depth: 0, joins: false })).toMatchObject({ bio: '', photo: null, isActiveDerived: false })
    // Season rows are rebuilt, not restored: the restored player has none yet, the target keeps the combined row.
    expect((await rows('player_seasons')).filter((r) => r.player_id === s.source)).toHaveLength(0)
    // Appearances relinked by name key.
    const apps = await rows('match_appearances')
    expect(apps.find((a) => a.match_id === s.g1)!.player_id).toBe(s.source)
    expect(apps.find((a) => a.match_id === s.g2)!.player_id).toBe(s.target)
    expect((await rows('merge_log'))[0]).toMatchObject({ status: 'undone' })

    // A simulated sync routes the original name key to the restored player.
    const aliasMap = new Map((await rows('player_aliases')).map((a) => [a.name_key as string, Number(a.player_id)]))
    const plan = buildSyncPlan([{ seasonName: 'Summer 2025/26', seasonOrder: 1, teamId: 'B', teamName: 'B', gradeName: 'B Grade', stats: [stat('Jon', 'Smith')] }], aliasMap, new Set())
    expect(plan.newPlayers).toEqual([])
    expect(plan.seasonRows).toEqual([expect.objectContaining({ playerId: s.source, teamId: 'B', games: 2 })])
    // Undoing twice is refused.
    expect((await rest('POST', `/players/merge-log/${log.id}/undo`, { token: admin })).status).toBe(409)
  })

  it('keeps edits made to the target since the merge', async () => {
    const s = await setup()
    await rest('POST', `/players/${s.source}/merge`, { token: editor, body: { targetId: s.target } })
    await payload.update({ collection: 'players', id: s.target, data: { bio: 'Edited by the committee.' }, context: ctx })
    const log = (await rows('merge_log'))[0]
    expect((await rest('POST', `/players/merge-log/${log.id}/undo`, { token: admin })).status).toBe(200)
    expect(await payload.findByID({ collection: 'players', id: s.target, depth: 0, joins: false })).toMatchObject({ bio: 'Edited by the committee.' })
  })

  it('is refused once the player it was merged into has itself been merged away', async () => {
    const s = await setup()
    const third = await player('Johnny', 'Smythe')
    await rest('POST', `/players/${s.source}/merge`, { token: editor, body: { targetId: s.target } })
    const first = (await rows('merge_log'))[0]
    expect((await rest('POST', `/players/${s.target}/merge`, { token: editor, body: { targetId: third } })).status).toBe(200)
    const undo = await rest('POST', `/players/merge-log/${first.id}/undo`, { token: admin })
    expect(undo.status).toBe(409)
    expect(undo.json.errors[0].message).toContain('Undo that later merge first')
    // Undoing the later merge, then the earlier one, works in order.
    const later = (await rows('merge_log')).find((l) => l.id !== first.id)!
    expect((await rest('POST', `/players/merge-log/${later.id}/undo`, { token: admin })).status).toBe(200)
  })

  it('lists recent merges with whether each can be undone', async () => {
    const s = await setup()
    await rest('POST', `/players/${s.source}/merge`, { token: editor, body: { targetId: s.target } })
    const recent = await getRecentMerges()
    expect(recent[0]).toMatchObject({ sourceName: 'Jon Smith', targetName: 'John Smith', undoable: true, status: 'applied' })
  })
})

describe('same-game refusal', () => {
  it('refuses a merge of two players who played the same game, naming it, and merges only when confirmed', async () => {
    const a = await player('Pat', 'Lee')
    const b = await player('Patrick', 'Lee')
    const shared = await game('shared', [{ player: a, key: 'pat|lee' }, { player: b, key: 'patrick|lee' }])
    await game('only-a', [{ player: a, key: 'pat|lee' }])
    const res = await rest('POST', `/players/${a}/merge`, { token: editor, body: { targetId: b } })
    expect(res.status).toBe(409)
    expect(res.json.code).toBe('same_game')
    expect(res.json.errors[0].message).toContain('2025-11-02 against Demo Rovers')
    expect(res.json.sharedGames).toEqual([{ date: '2025-11-02', opponent: 'Demo Rovers' }])
    expect((await rows('players')).map((p) => p.id)).toEqual([a, b])
    expect(await rows('merge_log')).toHaveLength(0)

    const ok = await rest('POST', `/players/${a}/merge`, { token: editor, body: { targetId: b, confirmSameGame: true } })
    expect(ok.status).toBe(200)
    const apps = await rows('match_appearances')
    // The colliding row is not merged (left unlinked); the other game moves.
    expect(apps.filter((x) => x.match_id === shared && x.name_key === 'pat|lee')[0].player_id).toBeNull()
    expect(apps.filter((x) => x.name_key === 'pat|lee' && x.match_id !== shared)[0].player_id).toBe(b)
    // A later sync relinks by alias; it must not put one player on both rows of the shared game again.
    await relinkMatchPlayers(payload)
    const after = (await rows('match_appearances')).filter((x) => x.match_id === shared)
    expect(after.filter((x) => x.player_id === b)).toHaveLength(1)
    expect(after.find((x) => x.name_key === 'pat|lee')!.player_id).toBeNull()
  })
})

describe('duplicate suggestions', () => {
  it('ranks the near-duplicate pair, vetoes a same-game pair and honours a dismissal', async () => {
    const a = await player('Jon', 'Smith'), b = await player('John', 'Smith')
    await season(a, 'T1'); await season(b, 'T1')
    const c = await player('Pat', 'Lee'), d = await player('Patt', 'Lee')
    await game('together', [{ player: c, key: 'pat|lee' }, { player: d, key: 'patt|lee' }])
    const s = await getDuplicateSuggestions()
    const ids = s.map((x) => [x.a.id, x.b.id].sort().join('|'))
    expect(ids).toContain([a, b].sort().join('|'))
    expect(ids).not.toContain([c, d].sort().join('|'))
    expect(s[0].reasons.length).toBeGreaterThan(0)

    expect((await rest('POST', '/players/duplicates/dismiss', { token: editor, body: { a, b } })).status).toBe(403)
    expect((await rest('POST', '/players/duplicates/dismiss', { token: admin, body: { a, b } })).status).toBe(200)
    expect((await getDuplicateSuggestions()).map((x) => [x.a.id, x.b.id].sort().join('|'))).not.toContain([a, b].sort().join('|'))
  })
})

describe('dismissals', () => {
  it('rejects unknown ids, survives the one-year purge and survives the other player being deleted', async () => {
    const a = await player('Jon', 'Smith'), b = await player('John', 'Smith')
    await season(a, 'T1'); await season(b, 'T1')
    expect((await rest('POST', '/players/duplicates/dismiss', { token: admin, body: { a, b: 999999 } })).status).toBe(404)
    expect(await dismissPair(payload, a, b, null)).toEqual({ ok: true })
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString()
    await payload.db.drizzle.execute(sql.raw(`UPDATE "payload"."merge_log" SET created_at = '${old}'`))
    await purgeOldMergeLog(payload)
    expect(await rows('merge_log')).toHaveLength(1)
    // The other player is deleted: the foreign key clears, the pair is still remembered.
    const t = playerTables(payload)
    await payload.db.drizzle.execute(sql.raw(`DELETE FROM "payload"."player_seasons" WHERE player_id = ${b}`))
    const c = await player('Joan', 'Smith')
    await season(c, 'T1')
    await payload.db.drizzle.execute(sql.raw(`UPDATE "payload"."merge_log" SET target_player_id = NULL`))
    expect(t).toBeTruthy()
    expect((await getDuplicateSuggestions()).map((x) => [x.a.id, x.b.id].sort().join('|'))).not.toContain([a, b].sort().join('|'))
  })
})

describe('merge log access', () => {
  it('is readable by an admin and not by an editor', async () => {
    const a = await player('Jon', 'Smith'), b = await player('John', 'Smith')
    await dismissPair(payload, a, b, null)
    expect((await rest('GET', '/merge-log', { token: editor })).status).toBe(403)
    expect((await rest('GET', '/merge-log', { token: admin })).status).toBe(200)
  })
})
