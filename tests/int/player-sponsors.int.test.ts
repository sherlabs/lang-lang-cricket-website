/**
 * player-sponsors.int (design note 2026-10-04): REST access (anonymous sees active rows of
 * visible players only; writes are staff-only), the public query layer, and the rendered
 * /players band, player-page block and /sponsors mention.
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
let editor: string
let logo: { id: number; url?: string | null }
let sponsorId: number
let visible: { id: number; slug?: string | null }
let hidden: { id: number }
let activeRow: number
let inactiveRow: number
let hiddenPlayerRow: number

const html = async (load: () => Promise<React.ReactNode>) => renderToStaticMarkup((await load()) as React.ReactElement)

beforeAll(async () => {
  payload = await getTestPayload()
  editor = await tokenFor(payload, 'editor')
  await clearCollection(payload, 'player-sponsors')
  await clearCollection(payload, 'sponsors')
  await clearCollection(payload, 'people')
  await resetPlayers(payload)
  logo = await payload.create({
    collection: 'media',
    data: { filename: 'sponsor-logo.png', prefix: 'ps-test', mimeType: 'image/png', focalX: 50, focalY: 50, alt: 'logo', legacyUrl: 'https://legacy.test/sponsor-logo.png' },
    context: { etl: true, disableRevalidate: true },
  })
  sponsorId = (await payload.create({ collection: 'sponsors', data: { name: 'Sunscape Solar', tier: 'Player', logo: logo.id, linkUrl: 'https://sunscape.example.com' }, context: ctx })).id
  visible = await payload.create({ collection: 'players', data: { firstName: 'Sam', lastName: 'Taylor' }, context: ctx })
  hidden = await payload.create({ collection: 'players', data: { firstName: 'Hidden', lastName: 'Harry', hidden: true }, context: ctx })
  const row = (player: number, extra: Record<string, unknown> = {}) =>
    payload.create({ collection: 'player-sponsors', data: { player, sponsor: sponsorId, ...extra }, context: ctx }).then((d) => d.id)
  activeRow = await row(visible.id, { message: 'Proudly backing Sam', season: '2025/26' })
  inactiveRow = await row(visible.id, { active: false })
  hiddenPlayerRow = await row(hidden.id)
})

afterAll(async () => {
  await clearCollection(payload, 'player-sponsors')
  await clearCollection(payload, 'sponsors')
  await clearCollection(payload, 'people')
  await resetPlayers(payload)
  await payload.delete({ collection: 'media', id: logo.id, context: { etl: true, disableRevalidate: true } }).catch(() => undefined)
  await destroyTestPayload(payload)
})

describe('access', () => {
  it('anonymous REST sees only active rows of players who are not hidden', async () => {
    const res = await rest('GET', '/player-sponsors?limit=50&depth=0')
    expect(res.status).toBe(200)
    expect(res.json.docs.map((d: { id: number }) => d.id)).toEqual([activeRow])
    expect(res.json.docs.map((d: { id: number }) => d.id)).not.toContain(inactiveRow)
    expect(res.json.docs.map((d: { id: number }) => d.id)).not.toContain(hiddenPlayerRow)
    expect((await rest('GET', `/player-sponsors/${hiddenPlayerRow}`)).status).toBe(404)
  })

  it('staff see every row', async () => {
    const res = await rest('GET', '/player-sponsors?limit=50&depth=0', { token: editor })
    expect(res.json.docs.map((d: { id: number }) => d.id).sort()).toEqual([activeRow, inactiveRow, hiddenPlayerRow].sort())
  })

  it('anonymous POST/PATCH/DELETE are refused; staff can create', async () => {
    expect((await rest('POST', '/player-sponsors', { body: { player: visible.id, sponsor: sponsorId } })).status).toBe(403)
    expect((await rest('PATCH', `/player-sponsors/${activeRow}`, { body: { active: false } })).status).toBe(403)
    expect((await rest('DELETE', `/player-sponsors/${activeRow}`)).status).toBe(403)
    const created = await rest('POST', '/player-sponsors', { token: editor, body: { player: visible.id, sponsor: sponsorId, message: 'x' } })
    expect(created.status).toBe(201)
    await rest('DELETE', `/player-sponsors/${created.json.doc.id}`, { token: editor })
  })

  it('requires a player and a sponsor, and caps the message', async () => {
    expect((await rest('POST', '/player-sponsors', { token: editor, body: { sponsor: sponsorId } })).status).toBe(400)
    expect((await rest('POST', '/player-sponsors', { token: editor, body: { player: visible.id } })).status).toBe(400)
    expect((await rest('POST', '/player-sponsors', { token: editor, body: { player: visible.id, sponsor: sponsorId, message: 'x'.repeat(281) } })).status).toBe(400)
  })
})

describe('public query layer and rendering', () => {
  it('lists active sponsorships of visible players with the sponsor logo and link', async () => {
    const { listPlayerSponsorTiles, listSponsorsOfPlayer } = await import('@/lib/player-sponsors-queries')
    const tiles = await listPlayerSponsorTiles()
    expect(tiles.map((t) => t.id)).toEqual([activeRow])
    expect(tiles[0]).toMatchObject({ playerName: 'Sam Taylor', playerSlug: visible.slug, sponsorName: 'Sunscape Solar', sponsorLinkUrl: 'https://sunscape.example.com', message: 'Proudly backing Sam', season: '2025/26' })
    expect(tiles[0].sponsorLogoUrl).toBe((await payload.findByID({ collection: 'media', id: logo.id })).url)
    expect((await listSponsorsOfPlayer(visible.id)).length).toBe(1)
    expect(await listSponsorsOfPlayer(hidden.id)).toEqual([])
  })

  it('/players shows the band, with the player photo from the identity rule; /sponsors names the player', async () => {
    const photo = await payload.create({
      collection: 'media',
      data: { filename: 'sam.jpg', prefix: 'ps-test', mimeType: 'image/jpeg', focalX: 50, focalY: 50, alt: 'Sam', legacyUrl: 'https://legacy.test/sam.jpg' },
      context: { etl: true, disableRevalidate: true },
    })
    // Sam has no photo of their own: the linked committee entry's photo is used.
    await payload.create({ collection: 'people', data: { name: 'Sam Taylor', role: 'Treasurer', player: visible.id, photo: photo.id }, context: ctx })
    const photoUrl = (await payload.findByID({ collection: 'media', id: photo.id })).url!
    const { default: Players } = await import('@/app/(frontend)/players/page')
    const { default: Sponsors } = await import('@/app/(frontend)/sponsors/page')
    const players = await html(() => Players())
    expect(players).toContain('Player sponsors')
    expect(players).toContain(`/players/${visible.slug}`)
    expect(players).toContain(photoUrl)
    expect(players).toContain('Sunscape Solar')
    expect(players).toContain('Proudly backing Sam')
    expect(players).not.toContain('Hidden Harry')
    const sponsors = await html(() => Sponsors())
    expect(sponsors).toContain('backs')
    expect(sponsors).toContain('Sam Taylor')
    await payload.delete({ collection: 'media', id: photo.id, context: { etl: true, disableRevalidate: true } }).catch(() => undefined)
  }, 120_000)

  it('the player page block renders for sponsored players and nothing otherwise', async () => {
    const { SponsoredBy } = await import('@/components/players/player-sponsors')
    const { listSponsorsOfPlayer } = await import('@/lib/player-sponsors-queries')
    const markup = renderToStaticMarkup(SponsoredBy({ tiles: await listSponsorsOfPlayer(visible.id) })!)
    expect(markup).toContain('Sponsored by')
    expect(markup).toContain('Sunscape Solar')
    expect(markup).toContain('target="_blank"')
    expect(SponsoredBy({ tiles: [] })).toBeNull()
  })
})

describe('player lifecycle', () => {
  it('merging a player repoints their sponsorships to the target', async () => {
    const source = await payload.create({ collection: 'players', data: { firstName: 'Dup', lastName: 'Dupe' }, context: ctx })
    const target = await payload.create({ collection: 'players', data: { firstName: 'Dup', lastName: 'Target' }, context: ctx })
    const sp = await payload.create({ collection: 'player-sponsors', data: { player: source.id, sponsor: sponsorId }, context: ctx })
    const res = await rest('POST', `/players/${source.id}/merge`, { token: editor, body: { targetId: target.id } })
    expect(res.status).toBe(200)
    expect((await payload.findByID({ collection: 'player-sponsors', id: sp.id, depth: 0 })).player).toBe(target.id)
  })

  it('deleting a player deletes their sponsorships', async () => {
    const p = await payload.create({ collection: 'players', data: { firstName: 'Gone', lastName: 'Soon' }, context: ctx })
    const sp = await payload.create({ collection: 'player-sponsors', data: { player: p.id, sponsor: sponsorId }, context: ctx })
    await payload.delete({ collection: 'players', id: p.id, context: ctx })
    await expect(payload.findByID({ collection: 'player-sponsors', id: sp.id })).rejects.toThrow()
  })
})

describe('deleting a sponsor', () => {
  it('removes its player sponsorships instead of failing on the NOT NULL link', async () => {
    const doomed = await payload.create({ collection: 'sponsors', data: { name: 'Doomed Plumbing', tier: 'Player' }, context: ctx })
    const player = await payload.create({ collection: 'players', data: { firstName: 'Del', lastName: 'Ete' }, context: ctx })
    await payload.create({ collection: 'player-sponsors', data: { player: player.id, sponsor: doomed.id }, context: ctx })
    await payload.delete({ collection: 'sponsors', id: doomed.id, context: ctx })
    const left = await payload.find({ collection: 'player-sponsors', where: { sponsor: { equals: doomed.id } }, depth: 0, overrideAccess: true })
    expect(left.totalDocs).toBe(0)
    await payload.delete({ collection: 'players', id: player.id, context: ctx })
  })
})
