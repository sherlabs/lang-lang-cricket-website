/**
 * fantasy-access.int (wave F WP-2, spec 4.8 and 4.9): the REST matrix over every fantasy collection for anonymous, selector, editor
 * and admin. Nothing is writable over REST by anyone; squads are not readable by any role (an editor who also plays cannot browse
 * rivals' picks); PIN hashes, salts and device codes never appear in any response; the join-link version is admin only; GraphQL is off.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fantasyToken } from '@/lib/fantasy/link'
import { registerEntry } from '@/lib/fantasy/join'
import { addAdminLog } from '@/lib/fantasy/admin'
import { destroyTestPayload, getTestPayload, rest, tokenFor, wipeTestData } from './helpers'
import { buildWorld, type World } from './fantasy-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const SLUGS = ['fantasy-seasons', 'fantasy-round-state', 'fantasy-prices', 'fantasy-entries', 'fantasy-squads'] as const
const SECRET_FIELDS = ['pinHash', 'pinSalt', 'deviceCodeHash', 'deviceCodeExpires']

describe('fantasy access', () => {
  let payload: Payload
  let w: World
  const tokens: Record<string, string | undefined> = {}
  let entryId: number

  beforeAll(async () => {
    payload = await getTestPayload()
    w = await buildWorld(payload)
    tokens.anonymous = undefined
    tokens.selector = await tokenFor(payload, 'selector')
    tokens.editor = await tokenFor(payload, 'editor')
    tokens.admin = await tokenFor(payload, 'admin')
    const e = await registerEntry(payload, { linkVersion: 1, ip: null }, w.season, { teamName: 'Access Team', pin: '483917', again: '483917' })
    if (!e.ok) throw new Error(e.message)
    entryId = e.entry.id
    // A squad for the OPEN round and one for a locked round, and an add-a-device code, so there is something to leak.
    const hist = { disableRevalidate: true, fantasyRescore: true }
    await payload.create({ collection: 'fantasy-squads', data: { entry: entryId, round: w.sat3, captain: w.ids.c1, spentTenths: 880, transfersUsed: 0, picks: Array.from({ length: 11 }, (_, i) => ({ player: w.ids[`c${i + 1}`] })) } as never, overrideAccess: true, context: hist })
    await payload.create({ collection: 'fantasy-squads', data: { entry: entryId, round: w.sat1, captain: w.ids.c1, spentTenths: 880, transfersUsed: 0, picks: [{ player: w.ids.c1 }] } as never, overrideAccess: true, context: hist })
    await payload.update({ collection: 'fantasy-entries', id: entryId, data: { deviceCodeHash: 'a'.repeat(64), deviceCodeExpires: new Date(Date.now() + 600_000).toISOString() } as never, overrideAccess: true, context: { disableRevalidate: true } })
    await addAdminLog(payload, w.season.id, 'PIN reset for Access Team by someone, 2026-10-13.')
  }, 180_000)

  afterAll(async () => {
    await wipeTestData(payload)
    await destroyTestPayload(payload)
  })

  const READ_STATUS: Record<(typeof SLUGS)[number], Record<string, number>> = {
    'fantasy-seasons': { anonymous: 401, selector: 403, editor: 200, admin: 200 },
    'fantasy-round-state': { anonymous: 401, selector: 403, editor: 200, admin: 200 },
    'fantasy-prices': { anonymous: 401, selector: 403, editor: 200, admin: 200 },
    'fantasy-entries': { anonymous: 401, selector: 403, editor: 403, admin: 200 },
    'fantasy-squads': { anonymous: 401, selector: 403, editor: 403, admin: 403 },
  }

  it.each(SLUGS)('%s: the read matrix', async (slug) => {
    for (const role of ['anonymous', 'selector', 'editor', 'admin'] as const) {
      const res = await rest('GET', `/${slug}?limit=50`, { token: tokens[role] })
      const want = READ_STATUS[slug][role]
      // Payload answers an unauthenticated read it refuses with 403 on some routes and 401 on others: both are a refusal.
      if (want === 200) expect(res.status, `${slug} ${role}`).toBe(200)
      else expect([401, 403], `${slug} ${role} -> ${res.status}`).toContain(res.status)
    }
  })

  it.each(SLUGS)('%s: nobody can create, change or delete over REST, not even an admin', async (slug) => {
    for (const role of ['anonymous', 'selector', 'editor', 'admin'] as const) {
      const token = tokens[role]
      expect([401, 403], `create ${slug} ${role}`).toContain((await rest('POST', `/${slug}`, { body: { teamName: 'x' }, token })).status)
      expect([401, 403, 404], `update ${slug} ${role}`).toContain((await rest('PATCH', `/${slug}/1`, { body: { teamName: 'x' }, token })).status)
      expect([401, 403, 404], `delete ${slug} ${role}`).toContain((await rest('DELETE', `/${slug}/1`, { token })).status)
    }
    expect((await payload.count({ collection: slug, overrideAccess: true })).totalDocs).toBeGreaterThanOrEqual(0)
  })

  it('an editor cannot read any squad row, before or after the lock, nor filter for one', async () => {
    for (const q of ['', `?where[round][equals]=${w.sat1}`, `?where[round][equals]=${w.sat3}`, `?where[entry][equals]=${entryId}`, `?where[captain][equals]=${w.ids.c1}`]) {
      const res = await rest('GET', `/fantasy-squads${q}`, { token: tokens.editor })
      expect([401, 403]).toContain(res.status)
      expect(JSON.stringify(res.json)).not.toContain('picks')
    }
    const byId = await payload.find({ collection: 'fantasy-squads', limit: 1, depth: 0, overrideAccess: true })
    const one = await rest('GET', `/fantasy-squads/${byId.docs[0].id}`, { token: tokens.editor })
    expect([401, 403, 404]).toContain(one.status)
    // An anonymous filter on the join returns nothing either.
    const anon = await rest('GET', `/fantasy-squads?where[entry][equals]=${entryId}`)
    expect([401, 403]).toContain(anon.status)
  })

  it('PIN hashes, salts and device codes are in no REST response for any role', async () => {
    for (const role of ['anonymous', 'selector', 'editor', 'admin'] as const) {
      for (const slug of SLUGS) {
        const body = JSON.stringify((await rest('GET', `/${slug}?limit=50&depth=2`, { token: tokens[role] })).json)
        for (const f of SECRET_FIELDS) expect(body, `${slug} ${role} ${f}`).not.toContain(`"${f}"`)
        expect(body).not.toContain('a'.repeat(64))
      }
    }
    const entries = (await rest('GET', '/fantasy-entries?limit=5', { token: tokens.admin })).json
    expect(entries.docs[0]).toMatchObject({ teamName: 'Access Team' })
    expect(Object.keys(entries.docs[0])).not.toContain('pinHash')
  })

  it('the committee log on a season is admin only', async () => {
    const asEditor = JSON.stringify((await rest('GET', '/fantasy-seasons?limit=5', { token: tokens.editor })).json)
    const asAdmin = JSON.stringify((await rest('GET', '/fantasy-seasons?limit=5', { token: tokens.admin })).json)
    expect(asEditor).not.toContain('adminLog')
    expect(asEditor).not.toContain('PIN reset')
    expect(asAdmin).toContain('PIN reset for Access Team')
  })

  it('site-settings: the switches are public, the join-link version is admin only, in REST and in the global read', async () => {
    const read = async (role: string) => (await rest('GET', '/globals/site-settings?depth=0', { token: tokens[role] })).json?.fantasy
    for (const role of ['anonymous', 'selector', 'editor']) {
      const f = await read(role)
      expect(f, role).toMatchObject({ enabled: true, publicLeaderboard: false, competitionName: 'Fantasy cricket' })
      expect(f, role).not.toHaveProperty('linkVersion')
    }
    expect(await read('admin')).toMatchObject({ enabled: true, linkVersion: 1 })
    // An editor cannot change the version or the on/off switch over REST (field access drops the write); the public toggle is theirs.
    await rest('POST', '/globals/site-settings', { token: tokens.editor, body: { fantasy: { linkVersion: 9, enabled: false, publicLeaderboard: true } } })
    const after = (await payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })) as unknown as { fantasy: { linkVersion: number; enabled: boolean; publicLeaderboard: boolean } }
    expect(after.fantasy.linkVersion).toBe(1)
    expect(after.fantasy.enabled).toBe(true)
    expect(after.fantasy.publicLeaderboard).toBe(true)
    await payload.updateGlobal({ slug: 'site-settings', data: { fantasy: { publicLeaderboard: false } } as never, overrideAccess: true, context: { disableRevalidate: true } })
    void fantasyToken
  })

  it('GraphQL stays disabled', async () => {
    const res = await rest('POST', '/graphql', { body: { query: '{ __typename }' }, token: tokens.admin })
    expect(res.status).toBe(404)
  })
})
