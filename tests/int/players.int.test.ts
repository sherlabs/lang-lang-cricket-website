/**
 * players.int (spec §15; replaces players-admin-actions): slug/displayName/source hooks, the
 * PlayHQ delete guard (incl. after a REST `source` PATCH), the manual delete cascade, the merge
 * endpoint transaction (seasons combined and moved, aliases and honours moved with `_order`
 * continuing after the target's), and the public query layer.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { playerTables } from '@/lib/players/db'
import { destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { resetPlayers } from './players-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const ctx = { disableRevalidate: true }
let payload: Payload
let editor: string

beforeAll(async () => {
  payload = await getTestPayload()
  editor = await tokenFor(payload, 'editor', 'players-editor@example.com')
})

afterAll(async () => {
  await destroyTestPayload(payload)
})

beforeEach(async () => {
  await resetPlayers(payload)
})

/** A PlayHQ player as the sync writes it (drizzle; hooks bypassed). */
async function playhqPlayer(firstName: string, lastName: string, extra: Record<string, unknown> = {}): Promise<number> {
  const t = playerTables(payload)
  const now = new Date().toISOString()
  const slug = `${firstName}-${lastName}`.toLowerCase()
  const [row] = await payload.db.drizzle
    .insert(t.players)
    .values({ slug, firstName, lastName, displayName: `${firstName} ${lastName}`, source: 'playhq', createdAt: now, updatedAt: now, ...extra })
    .returning({ id: t.players.id })
  await payload.db.drizzle
    .insert(t.player_aliases)
    .values({ nameKey: `${firstName}|${lastName}`.toLowerCase(), player: row.id, createdAt: now, updatedAt: now })
  return row.id
}

async function season(player: number, teamId: string, counts: Record<string, unknown> = {}) {
  const t = playerTables(payload)
  const now = new Date().toISOString()
  const [row] = await payload.db.drizzle
    .insert(t.player_seasons)
    .values({ player, seasonName: 'Summer 2025/26', seasonOrder: 0, teamId, teamName: `Lang Lang ${teamId}`, createdAt: now, updatedAt: now, ...counts })
    .returning({ id: t.player_seasons.id })
  return row.id as number
}

describe('players: hooks', () => {
  it('a REST create is a manual player with a unique slug and a derived displayName, whatever is sent', async () => {
    const a = await rest('POST', '/players', {
      token: editor,
      body: { firstName: 'Jo', lastName: 'Smith', slug: 'hacked', source: 'playhq', displayName: 'Nope', isActiveDerived: true },
    })
    expect(a.status).toBe(201)
    expect(a.json.doc).toMatchObject({ slug: 'jo-smith', source: 'manual', displayName: 'Jo Smith', isActiveDerived: false, hidden: false })
    const b = await rest('POST', '/players', { token: editor, body: { firstName: 'Jo', lastName: 'Smith' } })
    expect(b.json.doc.slug).toBe('jo-smith-2')
  })

  it('an update keeps the slug and re-derives displayName from the stored and new names', async () => {
    const { doc } = (await rest('POST', '/players', { token: editor, body: { firstName: 'Ann', lastName: 'Lee' } })).json
    const res = await rest('PATCH', `/players/${doc.id}`, { token: editor, body: { lastName: 'Leigh', slug: 'x' } })
    expect(res.status).toBe(200)
    expect(res.json.doc).toMatchObject({ slug: 'ann-lee', displayName: 'Ann Leigh' })
  })

  it('a player with an empty last name (one-name PlayHQ player) can still be saved, with empty honour years', async () => {
    const id = await playhqPlayer('Cher', '')
    const res = await rest('PATCH', `/players/${id}`, { token: editor, body: { bio: 'hello', honours: [{ years: '', title: 'Life Member' }] } })
    expect(res.status).toBe(200)
    expect(res.json.doc).toMatchObject({ lastName: '', displayName: 'Cher', bio: 'hello', honours: [{ years: '', title: 'Life Member' }] })
    const bad = await rest('PATCH', `/players/${id}`, { token: editor, body: { firstName: '  ', honours: [{ years: '2020', title: ' ' }] } })
    expect(bad.status).toBe(400)
  })

  it('names and honour fields are trimmed (displayName has single spaces)', async () => {
    const res = await rest('POST', '/players', {
      token: editor,
      body: { firstName: ' Ann ', lastName: ' Lee ', honours: [{ years: ' 2024 ', title: ' Captain ' }] },
    })
    expect(res.status).toBe(201)
    expect(res.json.doc).toMatchObject({ firstName: 'Ann', lastName: 'Lee', displayName: 'Ann Lee', slug: 'ann-lee', honours: [{ years: '2024', title: 'Captain' }] })
  })

  it('a hand-typed alias nameKey is trimmed and lower-cased', async () => {
    const admin = await tokenFor(payload, 'admin', 'players-admin@example.com')
    const { doc: p } = (await rest('POST', '/players', { token: editor, body: { firstName: 'Kim', lastName: 'Ng' } })).json
    const res = await rest('POST', '/player-aliases', { token: admin, body: { nameKey: ' Kim|NG ', player: p.id } })
    expect(res.status).toBe(201)
    expect(res.json.doc.nameKey).toBe('kim|ng')
  })

  it('an editor PATCHing source, isActiveDerived or displayName leaves the stored values', async () => {
    const id = await playhqPlayer('Sam', 'Ward', { isActiveDerived: true })
    const res = await rest('PATCH', `/players/${id}`, { token: editor, body: { source: 'manual', isActiveDerived: false, displayName: 'X', bio: 'Keeper.' } })
    expect(res.status).toBe(200)
    const after = await payload.findByID({ collection: 'players', id, depth: 0 })
    expect(after).toMatchObject({ source: 'playhq', isActiveDerived: true, displayName: 'Sam Ward', bio: 'Keeper.' })
  })

  it('ETL context keeps every supplied value', async () => {
    const doc = await payload.create({
      collection: 'players',
      data: { firstName: 'Old', lastName: 'Timer', slug: 'legacy-slug', displayName: 'Legacy Name', source: 'playhq', isActiveDerived: true },
      context: { etl: true, disableRevalidate: true },
    })
    expect(doc).toMatchObject({ slug: 'legacy-slug', displayName: 'Legacy Name', source: 'playhq', isActiveDerived: true })
  })
})

describe('players: delete guard and cascade', () => {
  it('a PlayHQ player cannot be deleted, even after an editor PATCHes source=manual', async () => {
    const id = await playhqPlayer('Ben', 'Smith')
    await season(id, 'B')
    const del = await rest('DELETE', `/players/${id}`, { token: editor })
    expect(del.status).toBe(403)
    await rest('PATCH', `/players/${id}`, { token: editor, body: { source: 'manual' } })
    expect((await rest('DELETE', `/players/${id}`, { token: editor })).status).toBe(403)
    expect(await payload.count({ collection: 'players', where: { id: { equals: id } } })).toEqual({ totalDocs: 1 })
    expect((await payload.count({ collection: 'player-seasons', where: { player: { equals: id } } })).totalDocs).toBe(1)
    // The Local API is guarded too (the hook, not the access rule).
    await expect(payload.delete({ collection: 'players', id, context: ctx })).rejects.toThrow(/manually added/)
  })

  it('a manual player can be deleted; its aliases, seasons and honours go with it', async () => {
    const doc = await payload.create({
      collection: 'players',
      data: { firstName: 'Bill', lastName: 'Lawry', honours: [{ years: '1978', title: 'Captain' }] },
      context: ctx,
    })
    const now = new Date().toISOString()
    const t = playerTables(payload)
    await payload.db.drizzle.insert(t.player_aliases).values({ nameKey: 'bill|lawry', player: doc.id, createdAt: now, updatedAt: now })
    await season(doc.id, 'C')
    const del = await rest('DELETE', `/players/${doc.id}`, { token: editor })
    expect(del.status).toBe(200)
    expect((await payload.count({ collection: 'player-aliases' })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'player-seasons' })).totalDocs).toBe(0)
    const honours = await payload.db.drizzle.execute(sql`SELECT count(*)::int AS n FROM "payload"."players_honours"`)
    expect(honours.rows[0]).toEqual({ n: 0 })
  })

  it('anonymous REST cannot delete a manual player', async () => {
    const doc = await payload.create({ collection: 'players', data: { firstName: 'A', lastName: 'B' }, context: ctx })
    expect((await rest('DELETE', `/players/${doc.id}`)).status).toBe(403)
  })
})

describe('players: merge endpoint', () => {
  async function setup() {
    const media = await payload.create({
      collection: 'media',
      data: { filename: `merge-${Date.now()}.jpg`, prefix: 'players', mimeType: 'image/jpeg', filesize: 10, focalX: 50, focalY: 50 },
      context: ctx,
    })
    const target = await payload.create({
      collection: 'players',
      data: { firstName: 'Ben', lastName: 'Smith', bio: '', honours: [{ years: '2024', title: 'Club Champion' }, { years: '2023', title: 'Best Batter' }] },
      context: ctx,
    })
    const sourceId = await playhqPlayer('Benjamin', 'Smith', { isActiveDerived: true, bio: 'Opening bat.', photo: media.id })
    await payload.update({
      collection: 'players',
      id: sourceId,
      data: { honours: [{ years: '2020', title: 'Rookie of the Year' }, { years: '2021', title: 'Most Catches' }] },
      context: ctx,
    })
    const tB = await season(target.id, 'B', { games: 3, batRuns: 50, batHighScore: 30, batInnings: 3 })
    const sB = await season(sourceId, 'B', { games: 2, batRuns: 40, batHighScore: 35, batInnings: 2, batHighScoreNotOut: true })
    const sD = await season(sourceId, 'D', { games: 5 })
    return { target, sourceId, mediaId: media.id, tB, sB, sD }
  }

  it('moves seasons (combined per team), aliases and honours (after the target’s), fills photo/bio, ORs activity, deletes the source', async () => {
    const { target, sourceId, mediaId, tB, sB, sD } = await setup()
    const res = await rest('POST', `/players/${sourceId}/merge`, { token: editor, body: { targetId: target.id } })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true, targetId: target.id })

    expect(await payload.count({ collection: 'players', where: { id: { equals: sourceId } } })).toEqual({ totalDocs: 0 })
    const merged = await payload.findByID({ collection: 'players', id: target.id, depth: 0, joins: false })
    expect(merged).toMatchObject({ bio: 'Opening bat.', photo: mediaId, isActiveDerived: true, source: 'manual', slug: 'ben-smith' })
    expect(merged.honours?.map((h) => h.title)).toEqual(['Club Champion', 'Best Batter', 'Rookie of the Year', 'Most Catches'])
    const orders = await payload.db.drizzle.execute(
      sql`SELECT _order FROM "payload"."players_honours" WHERE _parent_id = ${target.id} ORDER BY _order`,
    )
    expect(orders.rows.map((r) => r._order)).toEqual([1, 2, 3, 4])

    const seasons = (await payload.find({ collection: 'player-seasons', where: { player: { equals: target.id } }, sort: 'teamId', depth: 0 })).docs
    expect(seasons.map((s) => s.id)).toEqual([tB, sD])
    expect(seasons[0]).toMatchObject({ games: 5, batRuns: 90, batInnings: 5, batHighScore: 35, batHighScoreNotOut: true })
    expect(await payload.count({ collection: 'player-seasons', where: { id: { equals: sB } } })).toEqual({ totalDocs: 0 })

    const aliases = (await payload.find({ collection: 'player-aliases', depth: 0 })).docs
    expect(aliases.map((a) => [a.nameKey, a.player])).toEqual([['benjamin|smith', target.id]])
  })

  it('keeps the target’s own photo and bio', async () => {
    const { target, sourceId } = await setup()
    const own = await payload.create({
      collection: 'media',
      data: { filename: `own-${Date.now()}.jpg`, prefix: 'players', mimeType: 'image/jpeg', filesize: 10, focalX: 50, focalY: 50 },
      context: ctx,
    })
    await payload.update({ collection: 'players', id: target.id, data: { bio: 'Mine.', photo: own.id }, context: ctx })
    expect((await rest('POST', `/players/${sourceId}/merge`, { token: editor, body: { targetId: target.id } })).status).toBe(200)
    expect(await payload.findByID({ collection: 'players', id: target.id, depth: 0, joins: false })).toMatchObject({ bio: 'Mine.', photo: own.id })
  })

  it('refuses a self-merge (after coercion), a missing player, and anonymous callers — changing nothing', async () => {
    const { target, sourceId } = await setup()
    const self = await rest('POST', `/players/${sourceId}/merge`, { token: editor, body: { targetId: String(sourceId) } })
    expect(self.status).toBe(400)
    expect(self.json.errors[0].message).toMatch(/different player/)
    expect((await rest('POST', `/players/${sourceId}/merge`, { token: editor, body: { targetId: 999999 } })).status).toBe(404)
    expect((await rest('POST', `/players/${sourceId}/merge`, { body: { targetId: target.id } })).status).toBe(401)
    expect((await payload.count({ collection: 'players' })).totalDocs).toBe(2)
    expect((await payload.count({ collection: 'player-seasons' })).totalDocs).toBe(3)
  })

  it('rolls back completely when a statement fails inside the transaction', async () => {
    const { target, sourceId } = await setup()
    // A trigger that rejects deleting the source makes step 7 fail after steps 1–6 ran.
    await payload.db.drizzle.execute(
      sql.raw(`CREATE OR REPLACE FUNCTION payload.wp5_block() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked'; END $$ LANGUAGE plpgsql`),
    )
    await payload.db.drizzle.execute(
      sql.raw(`CREATE TRIGGER wp5_block BEFORE DELETE ON payload.players FOR EACH ROW WHEN (OLD.id = ${sourceId}) EXECUTE FUNCTION payload.wp5_block()`),
    )
    try {
      const res = await rest('POST', `/players/${sourceId}/merge`, { token: editor, body: { targetId: target.id } })
      expect(res.status).toBeGreaterThanOrEqual(400)
    } finally {
      await payload.db.drizzle.execute(sql.raw('DROP TRIGGER wp5_block ON payload.players'))
      await payload.db.drizzle.execute(sql.raw('DROP FUNCTION payload.wp5_block()'))
    }
    expect((await payload.count({ collection: 'player-seasons', where: { player: { equals: sourceId } } })).totalDocs).toBe(2)
    expect((await payload.count({ collection: 'player-aliases', where: { player: { equals: sourceId } } })).totalDocs).toBe(1)
    const src = await payload.findByID({ collection: 'players', id: sourceId, depth: 0, joins: false })
    expect(src.honours).toHaveLength(2)
    expect((await payload.findByID({ collection: 'players', id: target.id, depth: 0, joins: false })).honours).toHaveLength(2)
  })
})

describe('players: merge picker query', () => {
  it('MergePlayerField’s REST query (limit=0) lists every other player, not one page', async () => {
    for (let i = 0; i < 12; i++) await payload.create({ collection: 'players', data: { firstName: `P${i}`, lastName: 'Q' }, context: ctx })
    const self = (await payload.find({ collection: 'players', limit: 1, depth: 0 })).docs[0].id
    const res = await rest('GET', `/players?where[id][not_equals]=${self}&limit=0&select[displayName]=true&sort=displayName&depth=0`, { token: editor })
    expect(res.status).toBe(200)
    expect(res.json.docs).toHaveLength(11)
    expect(Object.keys(res.json.docs[0]).sort()).toEqual(['displayName', 'id'])
  })
})

describe('players: public queries', () => {
  it('list and profile skip hidden players, sort seasons, keep honours order and resolve the photo URL', async () => {
    const media = await payload.create({
      collection: 'media',
      data: { filename: `pub-${Date.now()}.jpg`, prefix: 'players', mimeType: 'image/jpeg', filesize: 10, focalX: 50, focalY: 50 },
      context: ctx,
    })
    const shown = await playhqPlayer('Ravi', 'Kumar', { isActiveDerived: true, photo: media.id })
    await payload.update({ collection: 'players', id: shown, data: { honours: [{ years: '2024', title: 'A' }, { years: '2020', title: 'B' }] }, context: ctx })
    await playhqPlayer('Hidden', 'Player', { hidden: true })
    await season(shown, 'X', { seasonOrder: 1, seasonName: 'Summer 2024/25' })
    await season(shown, 'A', { seasonOrder: 0 })
    const { listPublicPlayers, getPlayerProfile } = await import('@/lib/players/queries')
    const { active, past } = await listPublicPlayers()
    expect([...active, ...past].map((c) => c.name)).toEqual(['Ravi Kumar'])
    expect(active[0].photoUrl).toMatch(/pub-.*\.jpg$/)
    expect(await getPlayerProfile('hidden-player')).toBeNull()
    const profile = await getPlayerProfile('ravi-kumar')
    expect(profile?.seasons.map((s) => s.teamId)).toEqual(['A', 'X'])
    expect(profile?.honours.map((h) => h.title)).toEqual(['A', 'B'])
    expect(profile?.yearsLabel).toBe('2024/25 – 2025/26')
  })
})
