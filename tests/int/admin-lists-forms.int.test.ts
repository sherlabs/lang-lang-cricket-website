import { renderToStaticMarkup } from 'react-dom/server'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NamedPhotoCell, OnOffCell, PlayerGamesCell, PlayerStatusCell, RelatedCell } from '@/payload/components/ListCells'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor, wipeTestData } from './helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const CTX = { disableRevalidate: true } as const

/**
 * Wave G WP-4: the redesigned lists and forms change only admin configuration, so every committee collection must still load its list
 * and its edit data for an admin and an editor, the field rules must be untouched, and the list cells must draw real rows (a page of
 * rows costs one lookup per kind, not one per row).
 */
describe('admin lists and forms (WP-4)', () => {
  let payload: Payload
  let admin: string
  let editor: string
  const ids: Record<string, number> = {}

  beforeAll(async () => {
    payload = await getTestPayload()
    for (const c of ['users', 'player-sponsors', 'players', 'sponsors', 'events', 'news', 'announcements', 'people', 'documents', 'media'] as const) await clearCollection(payload, c)
    admin = await tokenFor(payload, 'admin')
    editor = await tokenFor(payload, 'editor')
    const media = await payload.create({ collection: 'media', data: { filename: 'wp4-a.jpg', prefix: 'players', mimeType: 'image/jpeg', filesize: 10, focalX: 50, focalY: 50, alt: '' }, context: CTX })
    ids.media = media.id
    ids.playing = (await payload.create({ collection: 'players', data: { firstName: 'Pat', lastName: 'Playing', photo: media.id, activeOverride: 'active' }, context: CTX })).id
    ids.hidden = (await payload.create({ collection: 'players', data: { firstName: 'Hana', lastName: 'Hidden', hidden: true }, context: CTX })).id
    ids.past = (await payload.create({ collection: 'players', data: { firstName: 'Pete', lastName: 'Past', activeOverride: 'past' }, context: CTX })).id
    ids.sponsor = (await payload.create({ collection: 'sponsors', data: { name: 'Corner Cafe', tier: 'Gold', logo: media.id }, context: CTX })).id
    await payload.create({ collection: 'events', data: { type: 'one_time', title: 'Presentation night', eventDate: '2026-11-03T00:00:00.000Z' }, context: CTX })
    await payload.create({ collection: 'news', data: { title: 'A draft', status: 'draft', body: { root: { type: 'root', direction: 'ltr', format: '', indent: 0, version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: 'Body', format: 0, detail: 0, mode: 'normal', style: '' }] }] } } } as never, context: CTX })
    await payload.create({ collection: 'announcements', data: { title: 'Live', published: true }, context: CTX })
    ids.person = (await payload.create({ collection: 'people', data: { name: 'Sam Taylor', role: 'President', photo: media.id }, context: CTX })).id
    await payload.create({ collection: 'documents', data: { title: 'Policy', category: 'Policies' } as never, context: CTX })
    await payload.create({ collection: 'player-sponsors', data: { player: ids.playing, sponsor: ids.sponsor }, context: CTX })
  })

  afterAll(async () => {
    await wipeTestData(payload)
    await destroyTestPayload(payload)
  })

  const SLUGS = ['players', 'sponsors', 'events', 'news', 'announcements', 'people', 'documents', 'player-sponsors', 'gallery-photos'] as const

  it.each(['admin', 'editor'] as const)('%s: every committee list and edit page still loads its data', async (who) => {
    const token = who === 'admin' ? admin : editor
    for (const slug of SLUGS) {
      const list = await rest('GET', `/${slug}?depth=1&limit=10`, { token })
      expect(list.status, `${who} ${slug} list`).toBe(200)
      const first = list.json.docs[0]
      if (first) expect((await rest('GET', `/${slug}/${first.id}?depth=1`, { token })).status, `${who} ${slug} edit`).toBe(200)
    }
  })

  it('the Details area does not loosen field access: an editor still cannot change the web address, source or nightly flag', async () => {
    const before = await payload.findByID({ collection: 'players', id: ids.playing, depth: 0, overrideAccess: true })
    const res = await rest('PATCH', `/players/${ids.playing}`, { token: editor, body: { slug: 'hacked', source: 'playhq', isActiveDerived: false, bio: 'edited by the committee' } })
    expect(res.status).toBe(200)
    const after = await payload.findByID({ collection: 'players', id: ids.playing, depth: 0, overrideAccess: true })
    expect(after.slug).toBe(before.slug)
    expect(after.source).toBe(before.source)
    expect(after.isActiveDerived).toBe(before.isActiveDerived)
    expect(after.bio).toBe('edited by the committee')
  })

  it('player status cells show Playing now, Hidden and Past player for real rows', async () => {
    const { docs } = await payload.find({ collection: 'players', depth: 1, limit: 10, overrideAccess: true })
    const label = (name: string) => {
      const row = docs.find((d) => d.firstName === name)!
      return renderToStaticMarkup(PlayerStatusCell({ rowData: row, cellData: undefined } as never) as never)
    }
    expect(label('Pat')).toContain('Playing now')
    expect(label('Hana')).toContain('Hidden')
    expect(label('Pete')).toContain('Past player')
  })

  it('name cells draw the photo (or initials) and link to the record; one media lookup serves the whole page', async () => {
    const { docs } = await payload.find({ collection: 'players', depth: 0, limit: 10, overrideAccess: true })
    const spy = vi.spyOn(payload, 'find')
    const nodes = await Promise.all(
      docs.map((row) =>
        NamedPhotoCell({ payload, rowData: row, cellData: row.displayName, collectionSlug: 'players', link: true, imageField: 'photo' } as never),
      ),
    )
    const mediaCalls = spy.mock.calls.filter((c) => (c[0] as { collection: string }).collection === 'media').length
    spy.mockRestore()
    expect(mediaCalls).toBe(1)
    const withPhoto = renderToStaticMarkup(nodes[docs.findIndex((d) => d.firstName === 'Pat')] as never)
    expect(withPhoto).toContain('<img')
    expect(withPhoto).toContain(`/admin/collections/players/${ids.playing}`)
    expect(withPhoto).toContain('Pat Playing')
    const without = renderToStaticMarkup(nodes[docs.findIndex((d) => d.firstName === 'Hana')] as never)
    expect(without).not.toContain('<img')
    expect(without).toContain('>HH<')
  })

  it('games this season: one lookup for the page, a dash when none are recorded', async () => {
    const { docs } = await payload.find({ collection: 'players', depth: 0, limit: 10, overrideAccess: true })
    const spy = vi.spyOn(payload, 'find')
    const nodes = await Promise.all(docs.map((row) => PlayerGamesCell({ payload, rowData: row } as never)))
    const calls = spy.mock.calls.filter((c) => (c[0] as { collection: string }).collection === 'player-seasons').length
    spy.mockRestore()
    expect(calls).toBe(1)
    expect(renderToStaticMarkup(nodes[0] as never)).toContain('–')
  })

  it('a sponsorship shows the player and the business as a picture and a name', async () => {
    const ps = await payload.find({ collection: 'player-sponsors', depth: 0, limit: 1, overrideAccess: true })
    const row = ps.docs[0]
    const who = renderToStaticMarkup((await RelatedCell({ payload, rowData: row, cellData: row.player, collection: 'players', collectionSlug: 'player-sponsors', link: true } as never)) as never)
    expect(who).toContain('Pat Playing')
    const biz = renderToStaticMarkup((await RelatedCell({ payload, rowData: row, cellData: row.sponsor, collection: 'sponsors', collectionSlug: 'player-sponsors' } as never)) as never)
    expect(biz).toContain('Corner Cafe')
    expect(biz).toContain('ui-avatar--contain')
  })

  it('switch cells never print true or false', () => {
    for (const v of [true, false]) {
      const out = renderToStaticMarkup(OnOffCell({ cellData: v, on: 'Showing on the website', off: 'Hidden', rowData: {} } as never) as never)
      expect(out.replace(/<[^>]*>/g, '')).toBe(v ? 'Showing on the website' : 'Hidden')
    }
  })
})
