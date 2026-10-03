/**
 * yearbooks.int (BetterStats spec A9): the season-derived slug and its collision suffix, unique
 * and well-formed `seasonName`, `publishedAt` stamping, REST draft protection (list, id,
 * `where[status]` probing, depth expansion), staff visibility, and one explicit draft-exclusion
 * test per `lib/yearbooks-queries` function (the Local API bypasses the REST read rule).
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const ctx = { disableRevalidate: true }
let payload: Payload
let editor: string

const create = (data: Record<string, unknown>) =>
  payload.create({ collection: 'yearbooks', data: { title: 'Yearbook', seasonName: 'Summer 2025/26', ...data } as never, context: ctx })

beforeAll(async () => {
  payload = await getTestPayload()
  editor = await tokenFor(payload, 'editor')
})
afterAll(async () => {
  await clearCollection(payload, 'yearbooks')
  await clearCollection(payload, 'sponsors')
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await clearCollection(payload, 'yearbooks')
  await clearCollection(payload, 'sponsors')
})

describe('yearbooks collection rules', () => {
  it('derives the slug from the season and never changes it', async () => {
    const y = await create({})
    expect(y.slug).toBe('summer-2025-26')
    const again = await payload.update({ collection: 'yearbooks', id: y.id, data: { title: 'Renamed' }, context: ctx })
    expect(again.slug).toBe('summer-2025-26')
  })

  it('suffixes a colliding slug and rejects a duplicate season name', async () => {
    await create({})
    // Differs only in case, so seasonName stays unique but the slug collides.
    const second = await create({ seasonName: 'summer 2025/26' })
    expect(second.slug).toBe('summer-2025-26-2')
    await expect(create({})).rejects.toThrow()
  })

  it('rejects a season name that is not in the PlayHQ shape', async () => {
    for (const bad of ['2025/26', 'Summer 2025', 'Summer 2025-26', '']) {
      await expect(create({ seasonName: bad })).rejects.toThrow()
    }
  })

  it('defaults to draft and stamps publishedAt only once published', async () => {
    const draft = await create({})
    expect(draft.status).toBe('draft')
    expect(draft.publishedAt).toBeFalsy()
    const live = await payload.update({ collection: 'yearbooks', id: draft.id, data: { status: 'published' }, context: ctx })
    expect(live.publishedAt).toBeTruthy()
    const stamp = live.publishedAt
    const edited = await payload.update({ collection: 'yearbooks', id: draft.id, data: { title: 'Edited' }, context: ctx })
    expect(edited.publishedAt).toBe(stamp)
  })
})

describe('yearbooks REST access', () => {
  beforeEach(async () => {
    await create({ title: 'Live', seasonName: 'Summer 2024/25', status: 'published' })
    await create({ title: 'Secret', seasonName: 'Summer 2025/26', status: 'draft' })
  })

  it('anonymous list returns published only, even when the query asks for drafts', async () => {
    const all = await rest('GET', '/yearbooks')
    expect(all.json.docs.map((d: { title: string }) => d.title)).toEqual(['Live'])
    const probe = await rest('GET', '/yearbooks?where[status][equals]=draft')
    expect(probe.json.docs).toEqual([])
    const probeOr = await rest('GET', '/yearbooks?where[or][0][status][equals]=draft&where[or][1][status][equals]=published&depth=2')
    expect(probeOr.json.docs.map((d: { title: string }) => d.title)).toEqual(['Live'])
  })

  it('anonymous cannot fetch a draft by id or write anything', async () => {
    const draft = (await payload.find({ collection: 'yearbooks', where: { status: { equals: 'draft' } }, context: ctx })).docs[0]
    expect((await rest('GET', `/yearbooks/${draft.id}`)).status).toBe(404)
    expect((await rest('POST', '/yearbooks', { body: { title: 'x', seasonName: 'Summer 2020/21' } })).status).toBe(403)
    expect((await rest('DELETE', `/yearbooks/${draft.id}`)).status).toBe(403)
  })

  it('staff see both', async () => {
    const res = await rest('GET', '/yearbooks?sort=title', { token: editor })
    expect(res.json.docs.map((d: { title: string }) => d.title)).toEqual(['Live', 'Secret'])
  })
})

describe('lib/yearbooks-queries leaves drafts out', () => {
  let q: typeof import('@/lib/yearbooks-queries')
  beforeEach(async () => {
    q = await import('@/lib/yearbooks-queries')
    const sponsor = await payload.create({ collection: 'sponsors', data: { name: 'Acme Co', tier: 'Gold' }, context: ctx })
    await create({ title: 'Live', seasonName: 'Summer 2024/25', status: 'published', presidentMessage: 'Great year.\n\nThanks all.', featuredSponsors: [sponsor.id] })
    await create({ title: 'Secret', seasonName: 'Summer 2025/26', status: 'draft' })
  })

  it('listPublishedYearbooks', async () => {
    expect((await q.listPublishedYearbooks()).map((y) => y.slug)).toEqual(['summer-2024-25'])
  })

  it('getPublishedYearbookBySlug returns the book with its sponsors, and null for a draft', async () => {
    const live = await q.getPublishedYearbookBySlug('summer-2024-25')
    expect(live?.presidentMessage).toBe('Great year.\n\nThanks all.')
    expect(live?.sponsors.map((s) => s.name)).toEqual(['Acme Co'])
    expect(await q.getPublishedYearbookBySlug('summer-2025-26')).toBeNull()
    expect(await q.getPublishedYearbookBySlug('')).toBeNull()
  })

  it('getPublishedYearbookMeta', async () => {
    expect((await q.getPublishedYearbookMeta('summer-2024-25'))?.title).toBe('Live')
    expect(await q.getPublishedYearbookMeta('summer-2025-26')).toBeNull()
  })

  it('listPublishedYearbookSlugs (sitemap)', async () => {
    expect((await q.listPublishedYearbookSlugs()).map((y) => y.slug)).toEqual(['summer-2024-25'])
  })
})
