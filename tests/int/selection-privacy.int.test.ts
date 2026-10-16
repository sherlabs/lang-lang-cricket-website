import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { savePhone, setManualPin, issueOneTimeCode } from '@/lib/selector-profile-queries'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { getSelectionSettings } from '@/lib/selection/store'
import { playerView } from '@/lib/availability-public'
import { clearCollection, destroyTestPayload, getTestPayload, rest } from './helpers'
import { addToSquad, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const PASS = 'selection-pass-123'
const selectorUser = { id: 1, role: 'selector' } as never

/**
 * Personal data never leaves the selector area (announce-teams spec 1, 4.2, 4.9): phones, PIN hashes, salts and one-time codes are
 * absent from every response, REST `where` probes on them are refused or indistinguishable from "no match", and selectors cannot
 * write any selection collection over REST (their writes go through server actions that derive who did it).
 */
describe('selection privacy and access', () => {
  let payload: Payload
  const tokens = {} as Record<'admin' | 'editor' | 'selector', string>
  let playerId: number

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    const ctx = { seedAdmin: true, disableRevalidate: true }
    for (const role of ['admin', 'editor', 'selector'] as const) {
      await payload.create({ collection: 'users', data: { email: `${role}@example.com`, password: PASS, role }, context: ctx })
      tokens[role] = (await rest('POST', '/users/login', { body: { email: `${role}@example.com`, password: PASS } })).json.token
    }
    const p = await makePlayer(payload, 'Jo', 'Smith')
    playerId = p.id
    await savePhone(selectorUser, p.id, '0400 000 077')
    await setManualPin(selectorUser, p.id, '4321')
    await issueOneTimeCode(selectorUser, p.id)
    const squad = await makeSquad(payload, currentSeasonStartYear())
    await addToSquad(payload, squad.id, p.id)
    await makeFixture(payload)
  })
  afterAll(async () => {
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })

  const SLUGS = ['player-selection-profiles', 'selection-fixtures', 'availability', 'squads', 'squad-members', 'team-sheets'] as const

  it('anonymous and selector get nothing from any selection collection, and cannot write', async () => {
    for (const slug of SLUGS) {
      for (const token of [undefined, tokens.selector]) {
        const read = await rest('GET', `/${slug}?limit=5&depth=0`, { token })
        expect([401, 403], `${slug} read`).toContain(read.status)
        for (const [method, path, body] of [['POST', `/${slug}`, {}], ['PATCH', `/${slug}/1`, {}], ['DELETE', `/${slug}/1`, undefined]] as const) {
          const res = await rest(method, path, { token, body })
          expect([401, 403], `${slug} ${method}`).toContain(res.status)
        }
      }
    }
  })

  it('selection-fixtures cannot be written over REST by anyone, admin included', async () => {
    for (const token of [tokens.admin, tokens.editor]) {
      expect([401, 403, 404]).toContain((await rest('POST', '/selection-fixtures', { token, body: { gameId: 'x' } })).status)
    }
  })

  it('an editor can read profiles, but the PIN hash, salt and one-time code are never in a response', async () => {
    for (const token of [tokens.admin, tokens.editor]) {
      const res = await rest('GET', `/player-selection-profiles?depth=0&limit=10`, { token })
      expect(res.status).toBe(200)
      const text = JSON.stringify(res.json)
      expect(text).toContain('0400000077')
      for (const key of ['pinHash', 'pinSalt', 'otcHash', 'otcExpiresAt']) expect(text, key).not.toContain(key)
      const one = await rest('GET', `/player-selection-profiles/${res.json.docs[0].id}?depth=0`, { token })
      for (const key of ['pinHash', 'pinSalt', 'otcHash']) expect(JSON.stringify(one.json), key).not.toContain(key)
    }
  })

  it('a REST filter on a secret field cannot be used to guess it (no distinguishing result), for every role', async () => {
    for (const token of [undefined, tokens.selector, tokens.editor, tokens.admin]) {
      for (const field of ['pinHash', 'pinSalt', 'otcHash']) {
        const hitProbe = await rest('GET', `/player-selection-profiles?where[${field}][like]=a&depth=0`, { token })
        const missProbe = await rest('GET', `/player-selection-profiles?where[${field}][equals]=zzzznotthere&depth=0`, { token })
        const ok = (r: { status: number; json: { docs?: unknown[] } }) => [400, 401, 403].includes(r.status) || (r.status === 200 && r.json.docs?.length === 0)
        expect(ok(hitProbe), `${field} like as ${token ? 'user' : 'anonymous'}: ${hitProbe.status}`).toBe(true)
        expect(ok(missProbe), `${field} equals`).toBe(true)
        expect(hitProbe.status).toBe(missProbe.status)
      }
    }
    // Phones: refused for anonymous and selector (they cannot read the collection at all).
    for (const token of [undefined, tokens.selector]) {
      const probe = await rest('GET', `/player-selection-profiles?where[phone][like]=0400&depth=0`, { token })
      expect([401, 403]).toContain(probe.status)
    }
  })

  it('an editor cannot plant a PIN hash or a one-time code over REST', async () => {
    const res = await rest('POST', '/player-selection-profiles', { token: tokens.editor, body: { player: (await makePlayer(payload, 'Plant', 'Test')).id, pinHash: 'a'.repeat(64), pinSalt: 'b'.repeat(32), otcHash: 'c'.repeat(64) } })
    expect(res.status).toBe(201)
    const raw = await payload.find({ collection: 'player-selection-profiles', where: { player: { equals: res.json.doc.player.id ?? res.json.doc.player } }, showHiddenFields: true, overrideAccess: true })
    expect(raw.docs[0]).toMatchObject({ pinHash: null, pinSalt: null, otcHash: null })
  })

  it('a phone that is not a phone is refused, and a good one is stored as digits', async () => {
    const p = await makePlayer(payload, 'Bad', 'Phone')
    const bad = await rest('POST', '/player-selection-profiles', { token: tokens.editor, body: { player: p.id, phone: 'call me maybe' } })
    expect(bad.status).toBeGreaterThanOrEqual(400)
    const good = await rest('POST', '/player-selection-profiles', { token: tokens.editor, body: { player: p.id, phone: '+61 400 000 555' } })
    expect(good.status).toBe(201)
    expect(good.json.doc.phone).toBe('0400000555')
  })

  it('one profile per player', async () => {
    const dup = await rest('POST', '/player-selection-profiles', { token: tokens.editor, body: { player: playerId } })
    expect(dup.status).toBeGreaterThanOrEqual(400)
  })

  it('the selector area stores answers as the caller, whatever the input says (setBy and source are derived)', async () => {
    const [fixture] = (await payload.find({ collection: 'selection-fixtures', limit: 1, overrideAccess: true })).docs
    const editor = (await payload.find({ collection: 'users', where: { email: { equals: 'editor@example.com' } }, overrideAccess: true })).docs[0]
    const forged = await rest('POST', '/availability', { token: tokens.editor, body: { player: playerId, fixture: fixture.id, status: 'in', source: 'player', setBy: 999999 } })
    expect(forged.status).toBe(201)
    expect(forged.json.doc.source).toBe('selector')
    expect(forged.json.doc.setBy.id ?? forged.json.doc.setBy).toBe(editor.id)
  })

  it('what a player sees through the link carries no phone, PIN or other player', async () => {
    const view = await playerView(payload, playerId, await getSelectionSettings(payload))
    expect(JSON.stringify(view)).not.toMatch(/0400|4321|pin|phone|salt/i)
  })

  it('selection-settings is readable by a selector and writable only by an admin', async () => {
    expect((await rest('GET', '/globals/selection-settings', { token: tokens.selector })).status).toBe(200)
    expect((await rest('GET', '/globals/selection-settings')).status).toBeGreaterThanOrEqual(401)
    expect((await rest('POST', '/globals/selection-settings', { token: tokens.selector, body: { linkVersion: 9 } })).status).toBeGreaterThanOrEqual(401)
    expect((await rest('POST', '/globals/selection-settings', { token: tokens.editor, body: { linkVersion: 9 } })).status).toBeGreaterThanOrEqual(401)
    expect((await rest('POST', '/globals/selection-settings', { token: tokens.admin, body: { linkVersion: 3 } })).status).toBe(200)
  })
})
