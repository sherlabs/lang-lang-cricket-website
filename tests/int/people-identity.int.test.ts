/**
 * people-identity.int (design note 2026-10-04): a person is edited in ONE place. Updating a
 * person's photo or phone through the Local API changes what the home page, /people, /contact
 * and the linked player's tile and profile render. Pages are rendered to static markup with the
 * real query layer; only request-scoped Next APIs (cookies) are mocked.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { resetPlayers } from './players-helpers'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

const ctx = { disableRevalidate: true }
let payload: Payload
let mediaA: { id: number; url?: string | null }
let mediaB: { id: number; url?: string | null }
let personId: number
let playerId: number
let playerSlug: string

const registerMedia = (name: string) =>
  payload.create({
    collection: 'media',
    data: { filename: name, prefix: 'identity-test', mimeType: 'image/jpeg', focalX: 50, focalY: 50, alt: name, legacyUrl: `https://legacy.test/${name}` },
    context: { etl: true, disableRevalidate: true },
  })

const html = async (load: () => Promise<React.ReactNode>) => renderToStaticMarkup((await load()) as React.ReactElement)

beforeAll(async () => {
  payload = await getTestPayload()
  await clearCollection(payload, 'player-sponsors')
  await clearCollection(payload, 'people')
  await resetPlayers(payload)
  mediaA = await registerMedia('identity-a.jpg')
  mediaB = await registerMedia('identity-b.jpg')
  const player = await payload.create({ collection: 'players', data: { firstName: 'Russell', lastName: 'Savige' }, context: ctx })
  playerId = player.id
  playerSlug = player.slug!
  const person = await payload.create({
    collection: 'people',
    data: { name: 'Russell Savige', role: 'President', section: 'committee', phone: '0400 111 111', email: 'russ@example.com', photo: mediaA.id, player: playerId },
    context: ctx,
  })
  personId = person.id
})

afterAll(async () => {
  await clearCollection(payload, 'people')
  await resetPlayers(payload)
  for (const m of [mediaA, mediaB]) await payload.delete({ collection: 'media', id: m.id, context: { etl: true, disableRevalidate: true } }).catch(() => undefined)
  await destroyTestPayload(payload)
})

describe('one edit changes every page', () => {
  it('shows the person photo and phone on home, /people, /contact and the linked player', async () => {
    const urlA = (await payload.findByID({ collection: 'media', id: mediaA.id })).url!
    const urlB = (await payload.findByID({ collection: 'media', id: mediaB.id })).url!
    expect(urlA).not.toBe(urlB)

    const render = async () => {
      const { default: Home } = await import('@/app/(frontend)/page')
      const { default: People } = await import('@/app/(frontend)/people/page')
      const { default: Contact } = await import('@/app/(frontend)/contact/page')
      const { listPublicPlayers, getPlayerProfile } = await import('@/lib/players/queries')
      const { PlayerCardTile } = await import('@/components/players/player-card')
      const { active, past } = await listPublicPlayers()
      const card = [...active, ...past].find((c) => c.slug === playerSlug)!
      const profile = (await getPlayerProfile(playerSlug))!
      return {
        home: await html(() => Home()),
        people: await html(() => People()),
        contact: await html(() => Contact()),
        tile: renderToStaticMarkup(PlayerCardTile({ card })),
        profile,
      }
    }

    const before = await render()
    for (const page of [before.home, before.people, before.contact]) {
      expect(page).toContain('Russell Savige')
      expect(page).toContain(urlA)
      expect(page).toContain('0400 111 111')
    }
    expect(before.tile).toContain(urlA)
    expect(before.profile.player.photoUrl).toBe(urlA)
    expect(before.profile.clubRole).toBe('President')
    // The person card links to the player profile.
    expect(before.people).toContain(`/players/${playerSlug}`)

    await payload.update({ collection: 'people', id: personId, data: { photo: mediaB.id, phone: '0400 222 222' }, context: ctx })

    const after = await render()
    for (const page of [after.home, after.people, after.contact]) {
      expect(page).toContain(urlB)
      expect(page).not.toContain(urlA)
      expect(page).toContain('0400 222 222')
      expect(page).not.toContain('0400 111 111')
    }
    expect(after.tile).toContain(urlB)
    expect(after.profile.player.photoUrl).toBe(urlB)
  }, 120_000)

  it("the person's photo wins everywhere; a person without a photo borrows the player's", async () => {
    const { getPlayerProfile } = await import('@/lib/players/queries')
    const { listPeople } = await import('@/lib/people-queries')
    const urlA = (await payload.findByID({ collection: 'media', id: mediaA.id })).url!
    const urlB = (await payload.findByID({ collection: 'media', id: mediaB.id })).url!
    await payload.update({ collection: 'players', id: playerId, data: { photo: mediaA.id }, context: ctx })
    expect((await getPlayerProfile(playerSlug))!.player.photoUrl).toBe(urlB) // person has B, player has A: person wins
    await payload.update({ collection: 'people', id: personId, data: { photo: null }, context: ctx })
    expect((await listPeople()).find((p) => p.id === personId)!.photoUrl).toBe(urlA) // person borrows the player's
    await payload.update({ collection: 'players', id: playerId, data: { photo: null }, context: ctx })
    await payload.update({ collection: 'people', id: personId, data: { photo: mediaB.id }, context: ctx })
    expect((await getPlayerProfile(playerSlug))!.player.photoUrl).toBe(urlB)
  })

  it('a hidden player is not linked from the person card and is not shown on /players', async () => {
    const { listPeople } = await import('@/lib/people-queries')
    const { listPublicPlayers } = await import('@/lib/players/queries')
    await payload.update({ collection: 'players', id: playerId, data: { hidden: true }, context: ctx })
    expect((await listPeople()).find((p) => p.id === personId)!.playerSlug).toBe('')
    const { active, past } = await listPublicPlayers()
    expect([...active, ...past].some((c) => c.slug === playerSlug)).toBe(false)
    await payload.update({ collection: 'players', id: playerId, data: { hidden: false }, context: ctx })
  })

  it('deleting the player keeps the person and clears the link', async () => {
    const extra = await payload.create({ collection: 'players', data: { firstName: 'Temp', lastName: 'Player' }, context: ctx })
    const p = await payload.create({ collection: 'people', data: { name: 'Temp Person', role: 'Coach', player: extra.id }, context: ctx })
    await payload.delete({ collection: 'players', id: extra.id, context: ctx })
    const kept = await payload.findByID({ collection: 'people', id: p.id, depth: 0 })
    expect(kept.player).toBeNull()
  })
})

describe('REST rules for the new people.player field', () => {
  it('anonymous users cannot write it; staff can', async () => {
    expect((await rest('PATCH', `/people/${personId}`, { body: { player: null } })).status).toBe(403)
    const editor = await tokenFor(payload, 'editor')
    expect((await rest('PATCH', `/people/${personId}`, { token: editor, body: { player: playerId } })).status).toBe(200)
  })
})
