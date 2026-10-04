/**
 * club-apparel.int (design note 2026-10-04): the apparel link is its own global so the committee
 * (editors) can change it without write access to the admin-only club details. Validation is
 * http(s) only; getClub() exposes it as club.apparel, and null (render nothing) when empty.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

let payload: Payload
let editor: string

const setApparel = (data: Record<string, unknown>) => payload.updateGlobal({ slug: 'club-apparel', data, overrideAccess: true, context: { disableRevalidate: true } })

beforeAll(async () => {
  payload = await getTestPayload()
  editor = await tokenFor(payload, 'editor')
})
afterAll(async () => {
  await setApparel({ apparelUrl: '', apparelLabel: 'Club apparel', apparelBlurb: '' })
  await destroyTestPayload(payload)
})

describe('club-apparel global', () => {
  it('anonymous can read but not write; an editor can write', async () => {
    expect((await rest('GET', '/globals/club-apparel')).status).toBe(200)
    expect((await rest('POST', '/globals/club-apparel', { body: { apparelUrl: 'https://shop.example.com' } })).status).toBe(403)
    const res = await rest('POST', '/globals/club-apparel', { token: editor, body: { apparelUrl: 'https://shop.example.com/lang-lang', apparelBlurb: 'Order online' } })
    expect(res.status).toBe(200)
    expect(res.json.result.apparelUrl).toBe('https://shop.example.com/lang-lang')
  })

  it('stays empty by default: no seeded or invented URL', async () => {
    await payload.db.drizzle.execute((await import('@payloadcms/db-postgres/drizzle')).sql.raw('DELETE FROM "payload"."club_apparel"'))
    const fresh = await payload.findGlobal({ slug: 'club-apparel', overrideAccess: true })
    expect(fresh.apparelUrl ?? '').toBe('')
    expect(fresh.apparelLabel).toBe('Club apparel')
  })

  it('rejects non-http(s) URLs (REST and Local API)', async () => {
    for (const bad of ['javascript:alert(1)', 'shop.example.com', 'ftp://x.test']) {
      expect((await rest('POST', '/globals/club-apparel', { token: editor, body: { apparelUrl: bad } })).status, bad).toBe(400)
    }
    expect((await rest('POST', '/globals/club-apparel', { token: editor, body: { apparelUrl: '' } })).status).toBe(200)
  })

  it('getClub() exposes the saved link as club.apparel, null when empty', async () => {
    const { getClub } = await import('@/lib/club')
    await setApparel({ apparelUrl: '', apparelLabel: 'Shop', apparelBlurb: '' })
    expect((await getClub()).apparel).toBeNull()
    await setApparel({ apparelUrl: 'https://shop.example.com/x', apparelLabel: '', apparelBlurb: 'Hi' })
    expect((await getClub()).apparel).toEqual({ url: 'https://shop.example.com/x', label: 'Club apparel', blurb: 'Hi' })
  })

  it('the editor still cannot write the admin-only club details', async () => {
    expect((await rest('POST', '/globals/club', { token: editor, body: { name: 'Nope' } })).status).toBe(403)
  })
})
