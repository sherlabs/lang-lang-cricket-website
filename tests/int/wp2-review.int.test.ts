import path from 'node:path'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EtlReport } from '@/payload/scripts/etl/report'
import { clubStep } from '@/payload/scripts/etl/steps/club'
import type { EtlContext } from '@/payload/scripts/etl/media'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

// WP2 review fixes: trim before validation, sortFirst without a field default, ETL club step.
describe('wp2 review fixes', () => {
  let payload: Payload
  let editor: string

  beforeAll(async () => {
    payload = await getTestPayload()
    for (const c of ['people', 'announcements', 'sponsors', 'gallery-photos'] as const) await clearCollection(payload, c)
    editor = await tokenFor(payload, 'editor')
  })

  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('whitespace-only required values fail validation', async () => {
    expect((await rest('POST', '/people', { token: editor, body: { name: '   ', role: 'Coach' } })).status).toBe(400)
    expect((await rest('POST', '/people', { token: editor, body: { name: 'A', role: '  ' } })).status).toBe(400)
    expect((await rest('POST', '/announcements', { token: editor, body: { title: '   ' } })).status).toBe(400)
    expect((await rest('POST', '/sponsors', { token: editor, body: { name: '   ' } })).status).toBe(400)
  })

  it('announcements and sponsors trim like the old admin', async () => {
    const a = await rest('POST', '/announcements', { token: editor, body: { title: ' Working bee ', body: '\n Saturday 9am \n' } })
    expect(a.status).toBe(201)
    expect(a.json.doc).toMatchObject({ title: 'Working bee', body: 'Saturday 9am' })
    const s = await rest('POST', '/sponsors', { token: editor, body: { name: ' Acme ', linkUrl: ' https://acme.example ' } })
    expect(s.status).toBe(201)
    expect(s.json.doc).toMatchObject({ name: 'Acme', linkUrl: 'https://acme.example' })
  })

  it('gallery photos have no sortOrder default, so new rows go to the front', async () => {
    const field = payload.collections['gallery-photos'].config.fields.find((f) => 'name' in f && f.name === 'sortOrder')
    expect(field && 'defaultValue' in field ? field.defaultValue : undefined).toBeUndefined()
    const base = await payload.create({ collection: 'gallery-photos', data: { sortOrder: 5 }, overrideAccess: true })
    const absent = await payload.create({ collection: 'gallery-photos', data: {}, overrideAccess: true })
    expect(absent.sortOrder).toBe(4)
    const nulled = await payload.create({ collection: 'gallery-photos', data: { sortOrder: null }, overrideAccess: true })
    expect(nulled.sortOrder).toBe(3)
    const chosen = await payload.create({ collection: 'gallery-photos', data: { sortOrder: 0 }, overrideAccess: true })
    expect(chosen.sortOrder).toBe(0)
    for (const d of [base, absent, nulled, chosen]) await payload.delete({ collection: 'gallery-photos', id: d.id, overrideAccess: true })
  })

  it('the ETL club step keeps admin edits and fills only empty branding fields', async () => {
    const ctx = (update: boolean): EtlContext => ({
      payload,
      source: {} as EtlContext['source'],
      report: new EtlReport(false),
      dryRun: false,
      update,
      storeId: null,
      token: undefined,
      publicDir: path.resolve(process.cwd(), 'public'),
    })
    // An admin has edited the saved global; the logo is set, the OG image is empty.
    const originalName = (await payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true })).name
    await payload.updateGlobal({ slug: 'club', data: { name: 'Edited Club', logo: null, ogImage: null }, overrideAccess: true, context: { disableRevalidate: true } })
    const own = await payload.create({
      collection: 'media',
      data: { alt: 'own logo' },
      filePath: path.resolve(process.cwd(), 'public/assets/branding/logo.png'),
      overrideAccess: true,
    })
    await payload.updateGlobal({ slug: 'club', data: { logo: own.id }, overrideAccess: true, context: { disableRevalidate: true } })

    await clubStep.run(ctx(true))
    const club = await payload.findGlobal({ slug: 'club', depth: 1, overrideAccess: true })
    expect(club.name).toBe('Edited Club')
    expect(typeof club.logo === 'object' && club.logo?.id).toBe(own.id)
    const og = club.ogImage
    expect(typeof og === 'object' && og?.filename).toMatch(/^club-og-image/)

    // Nothing left to fill: a re-run writes nothing.
    const before = club.updatedAt
    await clubStep.run(ctx(true))
    expect((await payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true })).updatedAt).toBe(before)

    await payload.updateGlobal({ slug: 'club', data: { name: originalName, logo: null, ogImage: null }, overrideAccess: true, context: { disableRevalidate: true } })
    for (const id of [own.id, typeof og === 'object' ? og?.id : null]) if (id) await payload.delete({ collection: 'media', id, overrideAccess: true })
  })
})
