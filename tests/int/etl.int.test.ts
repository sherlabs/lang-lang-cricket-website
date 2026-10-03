/**
 * etl.int (spec §15, §12): the whole legacy ETL against the deterministic fixture, loaded into
 * schema `legacy_fixture` of the test database. Run twice to prove idempotency (0 writes, every
 * payload table byte-identical); orphans skipped; the 3-way media branch; ids + `setval` from
 * `GREATEST(MAX(id), last_value)`; a partially failed `player-seasons` insert resumed; the
 * timestamp post-pass; a field-for-field round trip of the preserved fields; verify (passing,
 * and failing on a tampered row); `--update --reconcile-deletes`; a dry run writes nothing.
 *
 * The storage plugin is enabled with the fake token (`@vercel/blob` mocked), so `/assets/`
 * uploads never touch disk or the network. The ETL itself runs as locally: no token, store id
 * `fakestore` (the fixture's Blob host).
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'

const blob = vi.hoisted(() => {
  process.env.PAYLOAD_BLOB_FAKE = '1'
  // allowIDOnCreate and documents' allowRestrictedFileTypes are read at config time.
  process.env.PAYLOAD_ETL = 'true'
  const { createRequire } = process.getBuiltinModule('node:module') as typeof import('node:module')
  const fromPlugin = createRequire(createRequire(import.meta.url).resolve('@payloadcms/storage-vercel-blob'))
  const put = vi.fn(async (pathname: string) => ({ url: `https://fakestore.public.blob.vercel-storage.com/${pathname}`, pathname }))
  const del = vi.fn(async (url: string | string[]) => void url)
  const head = vi.fn(async (url: string) => ({ url, size: 1234, contentType: 'image/jpeg' }))
  const pluginBlobPath = fromPlugin.resolve('@vercel/blob').replace(/index\.cjs$/, 'index.js')
  return { put, del, head, pluginBlobPath }
})

vi.mock(blob.pluginBlobPath, async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), put: blob.put, del: blob.del, head: blob.head }))
vi.mock('@vercel/blob', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), put: blob.put, del: blob.del, head: blob.head }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

type Source = import('@/payload/scripts/etl/source').LegacySource
type Ctx = import('@/payload/scripts/etl/media').EtlContext

const SCHEMA = 'legacy_fixture'
const COLLECTIONS = [
  'player-sync-runs', 'player-seasons', 'player-aliases', 'players', 'stories', 'event-photos', 'event-rsvps', 'events',
  'announcements', 'people', 'sponsors', 'gallery-photos', 'documents', 'media',
] as const

let payload: Payload
let source: Source
const fetchSpy = vi.fn()

async function sqlRows<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const { sql } = await import('@payloadcms/db-postgres/drizzle')
  return ((await payload.db.drizzle.execute(sql.raw(query))) as { rows: T[] }).rows
}

async function wipeTarget() {
  for (const c of COLLECTIONS) await sqlRows(`DELETE FROM "payload"."${c.replace(/-/g, '_')}"`)
  await resetGlobal(payload, 'club')
  await resetGlobal(payload, 'site-settings')
}

async function context(overrides: Partial<Ctx> = {}): Promise<Ctx> {
  const { EtlReport } = await import('@/payload/scripts/etl/report')
  return {
    payload,
    source,
    report: new EtlReport(Boolean(overrides.dryRun)),
    dryRun: false,
    update: false,
    storeId: 'fakestore',
    token: undefined,
    publicDir: path.resolve('public'),
    ...overrides,
  }
}

async function runEtl(overrides: Partial<Ctx> = {}, only?: string[], reconcile = false) {
  const { runEtl: run } = await import('@/payload/scripts/etl/run')
  const ctx = await context(overrides)
  await run(ctx, { only, reconcile })
  return ctx
}

async function verify(only?: string[], extra: Partial<import('@/payload/scripts/etl/verify').VerifyOptions> = {}) {
  const { verifyCutover } = await import('@/payload/scripts/etl/verify')
  return verifyCutover({ payload, source, storeId: 'fakestore', publicDir: path.resolve('public'), only, ...extra })
}

const failuresOf = (result: { checks: { failures: string[] }[] }) => result.checks.flatMap((c) => c.failures).join('\n')

/** Every payload content table: row count + hash of all rows (all columns) in id order. */
async function snapshot(): Promise<Record<string, string>> {
  const tables = await sqlRows<{ t: string }>(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'payload' AND table_type = 'BASE TABLE'
       AND table_name NOT LIKE 'payload\\_%' AND table_name NOT LIKE 'users%' ORDER BY 1`,
  )
  const out: Record<string, string> = {}
  for (const { t } of tables) {
    const rows = await sqlRows(`SELECT * FROM "payload"."${t}" ORDER BY 1`)
    out[t] = `${rows.length}:${createHash('sha256').update(JSON.stringify(rows)).digest('hex')}`
  }
  const seqs = await sqlRows(`SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = 'payload' ORDER BY 1`)
  out.__sequences = createHash('sha256').update(JSON.stringify(seqs)).digest('hex')
  return out
}

const legacy = <T = Record<string, unknown>>(table: string, orderBy = 'id') => source.rows<T & Record<string, unknown>>(table, orderBy)
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)

beforeAll(async () => {
  payload = await getTestPayload()
  const { seedLegacyFixture } = await import('@/payload/scripts/fixtures/legacy-fixture')
  await seedLegacyFixture(process.env.DATABASE_URI!, SCHEMA)
  const { openLegacySource } = await import('@/payload/scripts/etl/source')
  source = await openLegacySource({ url: process.env.DATABASE_URI!, schema: SCHEMA })
  await wipeTarget()
  vi.stubGlobal('fetch', fetchSpy)
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await source?.close()
  await destroyTestPayload(payload)
  delete process.env.PAYLOAD_BLOB_FAKE
  delete process.env.PAYLOAD_ETL
})

describe('legacy ETL (fixture)', () => {
  let first: Ctx
  let afterFirst: Record<string, string>
  let dry: Ctx

  it('the source is read-only', async () => {
    await expect(source.query(`INSERT INTO "${SCHEMA}"."announcements" (title) VALUES ('x')`)).rejects.toThrow(/read-only/)
  })

  it('a dry run plans every row and writes nothing', async () => {
    const before = await snapshot()
    const ctx = await runEtl({ dryRun: true })
    expect(ctx.report.counts('stories').planned).toBe(5)
    dry = ctx
    expect(await snapshot()).toEqual(before)
    expect(blob.put).not.toHaveBeenCalled()
  })

  it('first run: imports every table, skips and reports orphans, takes all three media branches', async () => {
    first = await runEtl()
    const c = (s: string) => first.report.counts(s)
    expect(c('documents').created).toBe(8)
    expect(c('gallery-photos').created).toBe(7)
    expect(c('event-rsvps')).toMatchObject({ created: 6, skipped: 1 })
    expect(c('event-photos')).toMatchObject({ created: 4, skipped: 2 })
    expect(c('stories').created).toBe(5)
    expect(c('players').created).toBe(6)
    expect(c('player-seasons').created).toBe(6)
    const kinds = first.report.items.map((i) => `${i.kind} ${i.table}#${i.id}`)
    expect(kinds).toContain('orphan-skipped event_rsvps#9')
    expect(kinds).toContain('orphan-skipped event_photos#8')
    expect(kinds).toContain('story-image-dropped stories#1')
    // 3-way branch: own-store registered (no bytes), /assets/ uploaded, empty → null.
    expect(first.report.media.register).toBeGreaterThan(0)
    expect(first.report.media['upload-local-asset']).toBeGreaterThan(0)
    expect(first.report.media.empty).toBeGreaterThan(0)
    expect(first.report.media['fallback-local']).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    // The dry run tracks what the run claimed so far: within-run filename collisions, prefix
    // fallbacks and reuses show up in it too. (A local upload's name can still differ: Payload
    // also renames against files left on disk in ./<collection>, which a clean checkout lacks.)
    const fallbacks = (r: Ctx['report']) => r.items.filter((i) => i.kind === 'media-fallback-local').map((i) => `${i.table}#${i.id}`)
    expect(fallbacks(dry.report)).toEqual(expect.arrayContaining(fallbacks(first.report)))
    expect(fallbacks(dry.report)).toEqual(expect.arrayContaining(['committee_contacts#3', 'players#2', 'players#6', 'documents#9', 'gallery_photos#4']))
    expect(dry.report.media.reused).toBe(first.report.media.reused)
    expect(dry.report.media['upload-local-asset']).toBe(first.report.media['upload-local-asset'])
    expect(dry.report.media.register + dry.report.media['fallback-local']).toBe(first.report.media.register + first.report.media['fallback-local'])
    afterFirst = await snapshot()
  })

  it('verify passes, including the per-row URL check for every registered row', async () => {
    const result = await verify()
    const failures = result.checks.flatMap((c) => c.failures)
    expect(failures).toEqual([])
    expect(result.ok).toBe(true)
    const urls = result.checks.find((c) => c.name.startsWith('registered rows'))!
    expect(urls.checked).toBeGreaterThanOrEqual(15)
  })

  it('field-for-field round trip of the preserved fields', async () => {
    for (const r of await legacy('stories')) {
      const d = (await payload.findByID({ collection: 'stories', id: r.id as number, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
      expect({
        slug: d.slug, editToken: d.editToken, viewToken: d.viewToken, submittedByAdmin: d.submittedByAdmin,
        publishedAt: iso(d.publishedAt), reviewedAt: iso(d.reviewedAt), excerpt: d.excerpt, createdAt: iso(d.createdAt),
      }).toEqual({
        slug: r.slug, editToken: r.edit_token, viewToken: r.view_token, submittedByAdmin: r.submitted_by_admin,
        publishedAt: iso(r.published_at), reviewedAt: iso(r.reviewed_at), excerpt: r.excerpt, createdAt: iso(r.created_at),
      })
    }
    const { fullName } = await import('@/payload/hooks/displayName')
    for (const r of await legacy('players')) {
      const d = await payload.findByID({ collection: 'players', id: r.id as number, depth: 0, joins: false, overrideAccess: true })
      expect({ slug: d.slug, source: d.source, displayName: d.displayName, createdAt: iso(d.createdAt) }).toEqual({
        slug: r.slug, source: r.source, displayName: fullName(r.first_name, r.last_name), createdAt: iso(r.created_at),
      })
    }
    for (const r of await legacy('gallery_photos')) {
      const d = await payload.findByID({ collection: 'gallery-photos', id: r.id as number, depth: 0, overrideAccess: true })
      expect({ sortOrder: d.sortOrder, createdAt: iso(d.createdAt) }).toEqual({ sortOrder: r.sort_order, createdAt: iso(r.created_at) })
    }
    for (const r of await legacy('event_rsvps')) {
      const found = await payload.find({ collection: 'event-rsvps', where: { id: { equals: r.id } }, depth: 0, overrideAccess: true })
      if (r.id === 9) {
        expect(found.docs).toEqual([]) // the orphan
        continue
      }
      expect({ token: found.docs[0].editToken, occurrence: iso(found.docs[0].occurrenceDate) }).toEqual({ token: r.edit_token, occurrence: iso(r.occurrence_date) })
    }
    // Timestamp post-pass: announcements keep both legacy timestamps.
    for (const r of await legacy('announcements')) {
      const d = await payload.findByID({ collection: 'announcements', id: r.id as number, depth: 0, overrideAccess: true })
      expect([iso(d.createdAt), iso(d.updatedAt)]).toEqual([iso(r.created_at), iso(r.updated_at)])
    }
  })

  it('sequences continue from GREATEST(MAX(id), legacy last_value) + 1', async () => {
    const { ID_PRESERVING, nextSequenceValue } = await import('@/payload/scripts/etl/sequences')
    for (const { collection, legacyTable } of ID_PRESERVING) {
      const last = await source.sequenceLastValue(legacyTable)
      const [{ max }] = await sqlRows<{ max: number | null }>(`SELECT MAX(id) AS max FROM "payload"."${collection.replace(/-/g, '_')}"`)
      expect({ collection, next: await nextSequenceValue(payload, collection) }).toEqual({ collection, next: Math.max(Number(max ?? 0), last) + 1 })
    }
    // The fixture's sequences run 10 past the max id, so a new row skips the deleted legacy ids.
    const created = await payload.create({ collection: 'announcements', data: { title: 'new', body: '', published: false }, overrideAccess: true, context: { disableRevalidate: true } })
    const legacyMax = Math.max(...(await legacy('announcements')).map((r) => r.id as number))
    expect(created.id).toBe(legacyMax + 11)
    await payload.delete({ collection: 'announcements', id: created.id, overrideAccess: true, context: { disableRevalidate: true } })
    await sqlRows(`SELECT setval(pg_get_serial_sequence('"payload"."announcements"', 'id'), ${legacyMax + 11}, false)`)
  })

  it('second run writes 0 rows and leaves every table identical', async () => {
    blob.put.mockClear()
    const second = await runEtl()
    expect(second.report.writes()).toBe(0)
    expect(blob.put).not.toHaveBeenCalled()
    expect(await snapshot()).toEqual(afterFirst)
    expect((await verify()).ok).toBe(true)
  })

  it('duplicate-URL documents and gallery photos keep every row and get their own copy; verify accepts them', async () => {
    const BLOB = 'https://fakestore.public.blob.vercel-storage.com'
    const row = async (collection: 'documents' | 'gallery-photos', id: number) =>
      (await payload.findByID({ collection, id, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    const doc10 = await row('documents', 10)
    expect(doc10).toMatchObject({
      title: 'Game Day Checklist (second copy)', category: 'Policies', prefix: 'documents',
      filename: 'game-day-training-checklist-Qx7Lm2Pa9RtYb3Kd8WcZs1-dup10.pdf',
      legacyUrl: `${BLOB}/documents/game-day-training-checklist-Qx7Lm2Pa9RtYb3Kd8WcZs1.pdf`,
    })
    // The owner is untouched: registered in place under its own name.
    expect(await row('documents', 4)).toMatchObject({ filename: 'game-day-training-checklist-Qx7Lm2Pa9RtYb3Kd8WcZs1.pdf', legacyUrl: doc10.legacyUrl })
    expect(await row('documents', 11)).toMatchObject({ category: 'Child Safety', filename: 'ccca-extreme-weather-policy-dup11.pdf', legacyUrl: '/assets/documents/ccca-extreme-weather-policy.pdf' })
    expect(await row('gallery-photos', 8)).toMatchObject({ caption: 'Seniors 2025 (again)', filename: 'team-photo-Ab3De5Fg7Hi9Jk1Lm3No5Pq-dup8.jpg', prefix: 'gallery' })
    expect(await row('gallery-photos', 9)).toMatchObject({ caption: 'Second look', filename: 'photo-02-dup9.jpg', legacyUrl: '/assets/gallery/photo-02.jpg' })
    // A local-asset duplicate really copies the bytes; an own-store one waits for a token (no fetch here).
    expect(first.report.media['duplicate-copy']).toBe(2)
    expect(first.report.media['duplicate-copy-local']).toBe(2)
    const kinds = first.report.items.filter((i) => i.kind === 'media-duplicate-url').map((i) => `${i.table}#${i.id}`)
    expect(kinds).toEqual(['documents#10', 'documents#11', 'gallery_photos#8', 'gallery_photos#9'])
    const result = await verify(['documents', 'gallery-photos'])
    expect(failuresOf(result)).toBe('')
    expect(result.checks.flatMap((c) => c.notes).filter((n) => n.includes('own copy'))).toHaveLength(4)
  })

  it('verify fails a duplicate-URL row that has no copy (file-less, or a file that is not its own copy)', async () => {
    const saved = await sqlRows<{ filename: string }>(`SELECT filename FROM "payload"."documents" WHERE id = 10`)
    try {
      await sqlRows(`UPDATE "payload"."documents" SET filename = NULL WHERE id = 10`)
      expect(failuresOf(await verify(['documents']))).toContain('documents#10')
      await sqlRows(`UPDATE "payload"."documents" SET filename = 'not-its-own-copy.pdf' WHERE id = 10`)
      expect(failuresOf(await verify(['documents']))).toContain('documents#10: shares legacy url')
    } finally {
      await sqlRows(`UPDATE "payload"."documents" SET filename = '${saved[0].filename}' WHERE id = 10`)
    }
    expect((await verify()).ok).toBe(true)
  })

  it("deleting a duplicate's doc never deletes the shared original blob; --update keeps the copy and --update heals a file-less duplicate", async () => {
    const original = `${'https://fakestore.public.blob.vercel-storage.com'}/documents/game-day-training-checklist-Qx7Lm2Pa9RtYb3Kd8WcZs1.pdf`
    blob.del.mockClear()
    await payload.delete({ collection: 'documents', id: 10, overrideAccess: true, context: { disableRevalidate: true } })
    expect(blob.del).not.toHaveBeenCalled() // legacyUrl rows keep their blobs until decommission
    expect(await payload.count({ collection: 'documents', where: { legacyUrl: { equals: original } }, overrideAccess: true })).toEqual({ totalDocs: 1 })
    const gone = await runEtl({}, ['documents'])
    expect(gone.report.counts('documents').created).toBe(1)
    expect(gone.report.media['duplicate-copy-local']).toBe(1)
    // --update treats the copy as its legacy row's own file (no file-conflict re-import, no copy).
    blob.put.mockClear()
    const upd = await runEtl({ update: true }, ['documents', 'gallery-photos'])
    expect(upd.report.items.filter((i) => i.kind === 'file-conflict-replaced')).toEqual([])
    expect(upd.report.media['duplicate-copy'] ?? 0).toBe(0)
    expect(blob.put).not.toHaveBeenCalled()
    // A duplicate an older ETL left file-less is replaced by a copy.
    await sqlRows(`UPDATE "payload"."documents" SET filename = NULL, prefix = NULL, legacy_url = NULL WHERE id = 10`)
    const heal = await runEtl({ update: true }, ['documents'])
    expect(heal.report.items.map((i) => `${i.kind} ${i.table}#${i.id}`)).toEqual(['file-conflict-replaced documents#10', 'media-duplicate-url documents#10'])
    expect((await verify()).ok).toBe(true)
  })

  it('a partially failed player-seasons insert resumes cleanly (no row-count shortcut)', async () => {
    const ids = (await legacy('player_seasons')).map((r) => r.id as number)
    await sqlRows(`DELETE FROM "payload"."player_seasons" WHERE id IN (${ids.slice(0, 2).join(',')})`)
    const ctx = await runEtl({}, ['player-seasons'])
    expect(ctx.report.counts('player-seasons')).toMatchObject({ created: 2, skipped: ids.length - 2 })
    expect((await sqlRows(`SELECT id FROM "payload"."player_seasons" ORDER BY id`)).map((r) => Number(r.id))).toEqual(ids)
  })

  it('--update rewrites a player-seasons id that exists on both sides with stale data', async () => {
    const ids = (await legacy('player_seasons')).map((r) => r.id as number)
    await sqlRows(`UPDATE "payload"."player_seasons" SET season_name = 'stale', games = 999 WHERE id = ${ids[0]}`)
    const ctx = await runEtl({ update: true }, ['player-seasons'])
    expect(ctx.report.counts('player-seasons')).toMatchObject({ created: 0, updated: ids.length })
    const [row] = await sqlRows(`SELECT season_name, games FROM "payload"."player_seasons" WHERE id = ${ids[0]}`)
    const [want] = (await legacy('player_seasons')).filter((r) => r.id === ids[0])
    expect([row.season_name, Number(row.games)]).toEqual([want.season_name, Number(want.games)])
  })

  it('verify fails on a tampered preserved field and on a missing row', async () => {
    const [story] = await legacy('stories')
    await sqlRows(`UPDATE "payload"."stories" SET slug = 'tampered' WHERE id = ${story.id}`)
    const [rsvp] = await legacy('event_rsvps')
    const saved = await sqlRows(`SELECT * FROM "payload"."event_rsvps" WHERE id = ${rsvp.id}`)
    await sqlRows(`DELETE FROM "payload"."event_rsvps" WHERE id = ${rsvp.id}`)
    const result = await verify(['stories', 'event-rsvps'])
    expect(result.ok).toBe(false)
    const failures = result.checks.flatMap((c) => c.failures).join('\n')
    expect(failures).toContain(`stories#${story.id}.slug`)
    expect(failures).toContain(`event-rsvps: missing legacy ids ${rsvp.id}`)
    // Restore: --update rewrites the story, a normal run re-creates the RSVP.
    await runEtl({ update: true }, ['stories'])
    await runEtl({}, ['event-rsvps'])
    expect(saved).toHaveLength(1)
    expect((await verify()).ok).toBe(true)
  })

  it('--update --reconcile-deletes deletes stale legacy-range rows and keeps Payload-native ones', async () => {
    const { reconcileDeletes } = await import('@/payload/scripts/etl/reconcile')
    const ann = await legacy('announcements')
    const legacyIds = new Set(ann.map((r) => r.id as number))
    const legacyMax = Math.max(...legacyIds, await source.sequenceLastValue('announcements'))
    const staleId = [...Array(legacyMax).keys()].map((i) => i + 1).find((i) => !legacyIds.has(i))!
    const stamp = new Date().toISOString()
    await sqlRows(`INSERT INTO "payload"."announcements" (id, title, body, published, created_at, updated_at) VALUES (${staleId}, 'stale', '', false, '${stamp}', '${stamp}')`)
    const native = await payload.create({ collection: 'announcements', data: { title: 'native', body: '', published: false }, overrideAccess: true, context: { disableRevalidate: true } })
    expect(native.id).toBeGreaterThan(legacyMax)

    const ctx = await context({ update: true })
    await reconcileDeletes(ctx, ['announcements'])
    expect(ctx.report.counts('reconcile:announcements').deleted).toBe(1)
    expect(ctx.report.items.map((i) => i.kind)).toEqual(['native-rows', 'reconcile-deleted'])
    const left = (await sqlRows<{ id: number }>(`SELECT id FROM "payload"."announcements" ORDER BY id`)).map((r) => Number(r.id))
    expect(left).toEqual([...legacyIds, native.id].sort((a, b) => a - b))

    // A PlayHQ player that vanished from legacy is reconciled too (the delete guard yields to context.etl).
    const [player] = await legacy('players')
    const playerStale = Math.max(...(await legacy('players')).map((r) => r.id as number)) + 1
    await payload.create({
      collection: 'players',
      data: { id: playerStale, slug: 'gone', firstName: 'Gone', lastName: 'Player', displayName: 'Gone Player', source: 'playhq', honours: [] } as never,
      overrideAccess: true,
      context: { etl: true, disableRevalidate: true },
    })
    const ctx2 = await context({ update: true })
    await reconcileDeletes(ctx2, ['players'])
    expect(ctx2.report.counts('reconcile:players').deleted).toBe(1)
    expect(await payload.count({ collection: 'players', where: { id: { equals: player.id } }, overrideAccess: true })).toEqual({ totalDocs: 1 })
    await payload.delete({ collection: 'announcements', id: native.id, overrideAccess: true, context: { disableRevalidate: true } })
  })

  it('verify: a registered row whose stored name changed fails (standalone and in-run); fallbacks are listed', async () => {
    const url = 'https://fakestore.public.blob.vercel-storage.com/sponsors/harbour-plumbing-Kd8WcZs1Qx7Lm2Pa9RtYb3.png'
    const [row] = await sqlRows<{ id: number; filename: string }>(`SELECT id, filename FROM "payload"."media" WHERE legacy_url = '${url}'`)
    await sqlRows(`UPDATE "payload"."media" SET filename = 'harbour-plumbing-Kd8WcZs1Qx7Lm2Pa9RtYb3-1.png' WHERE id = ${row.id}`)
    try {
      const standalone = await verify()
      expect(standalone.ok).toBe(false)
      expect(failuresOf(standalone)).toContain(`media#${row.id}: plugin URL`)
      const inRun = await verify(undefined, { fileActions: new Map([[`media ${url}`, 'register']]) })
      expect(failuresOf(inRun)).toContain(`media#${row.id}: plugin URL`)
      // Only what the ETL itself did can exempt it.
      const exempt = await verify(undefined, { fileActions: new Map([[`media ${url}`, 'fallback-local']]) })
      expect(exempt.ok).toBe(true)
    } finally {
      await sqlRows(`UPDATE "payload"."media" SET filename = '${row.filename}' WHERE id = ${row.id}`)
    }
    const ok = await verify()
    expect(ok.ok).toBe(true)
    const notes = ok.checks.find((c) => c.name.startsWith('registered rows'))!.notes.join('\n')
    expect(notes).toMatch(/fallback row\(s\)/)
    expect(notes).toContain('contacts/logo.png')
    expect(notes).toContain('documents#9')
  })

  it('verify with a token HEADs the plugin URL of rows from every upload collection', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 })
    try {
      const result = await verify(undefined, { token: 'vercel_blob_rw_fakestore_x', headSample: 1000 })
      expect(result.ok).toBe(true)
      const heads = fetchSpy.mock.calls.map(([u]) => String(u))
      for (const prefix of ['sponsors/', 'documents/', 'gallery/', 'events/']) expect(heads.some((u) => u.startsWith(`https://fakestore.public.blob.vercel-storage.com/${prefix}`))).toBe(true)
      // A fallback row is HEADed at its own (re-uploaded) URL, not at legacyUrl.
      expect(heads).toContain('https://fakestore.public.blob.vercel-storage.com/documents/llcc-conflict-resolution-policy-Hn4Tg6Vb2NcXz8QwEr5Ty0.pdf')
      expect(heads.every((u) => !u.includes('/misc/'))).toBe(true)
    } finally {
      fetchSpy.mockReset()
    }
  })

  it('children of an event the events step skipped (unknown type) are orphans, not a foreign-key crash', async () => {
    await sqlRows(`INSERT INTO "${SCHEMA}"."events" (id, type, title) VALUES (60, 'multi_day', 'Tour')`)
    await sqlRows(`INSERT INTO "${SCHEMA}"."event_rsvps" (id, event_id, occurrence_date, name, edit_token) VALUES (60, 60, '2026-11-01 00:00:00', 'Kim', 'tok-60')`)
    await sqlRows(`INSERT INTO "${SCHEMA}"."event_photos" (id, event_id, url) VALUES (60, 60, '/assets/branding/hero.jpg')`)
    try {
      for (const dryRun of [true, false]) {
        const ctx = await runEtl({ dryRun }, ['events', 'event-rsvps', 'event-photos'])
        const kinds = ctx.report.items.map((i) => `${i.kind} ${i.table}#${i.id}`)
        expect(kinds).toEqual(expect.arrayContaining(['skipped events#60', 'orphan-skipped event_rsvps#60', 'orphan-skipped event_photos#60']))
      }
      expect((await verify(['events', 'event-rsvps', 'event-photos'])).ok).toBe(true)
    } finally {
      for (const t of ['event_photos', 'event_rsvps', 'events']) await sqlRows(`DELETE FROM "${SCHEMA}"."${t}" WHERE id = 60`)
    }
  })

  it("verify catches an upload row whose file is not its legacy row's; --update replaces it", async () => {
    const [saved] = await sqlRows<{ filename: string; prefix: string; legacy_url: string }>(`SELECT filename, prefix, legacy_url FROM "payload"."gallery_photos" WHERE id = 3`)
    // A Payload-native row of a failed window holding a reused legacy id.
    await sqlRows(`UPDATE "payload"."gallery_photos" SET legacy_url = NULL, filename = 'native-upload.jpg', prefix = 'gallery' WHERE id = 3`)
    const bad = await verify(['gallery-photos'])
    expect(bad.ok).toBe(false)
    expect(failuresOf(bad)).toContain('gallery-photos#3.legacyUrl')
    const ctx = await runEtl({ update: true }, ['gallery-photos'])
    expect(ctx.report.items.map((i) => `${i.kind} ${i.table}#${i.id}`)).toEqual(['file-conflict-replaced gallery_photos#3'])
    expect(ctx.report.counts('gallery-photos')).toMatchObject({ deleted: 1, created: 1 })
    const [now] = await sqlRows<{ filename: string; prefix: string; legacy_url: string }>(`SELECT filename, prefix, legacy_url FROM "payload"."gallery_photos" WHERE id = 3`)
    expect(now).toEqual(saved)
    expect((await verify()).ok).toBe(true)
  })

  it('verify fails a row a foreign URL left without a file', async () => {
    await sqlRows(`INSERT INTO "${SCHEMA}"."documents" (id, category, title, url) VALUES (15, 'Policies', 'Foreign', 'https://example.org/foreign.pdf')`)
    try {
      const ctx = await runEtl({}, ['documents'])
      expect(ctx.report.items.map((i) => `${i.kind} ${i.table}#${i.id}`)).toEqual(['media-flagged documents#15'])
      const result = await verify(['documents'])
      expect(result.ok).toBe(false)
      expect(failuresOf(result)).toContain('documents#15: no file')
    } finally {
      await sqlRows(`DELETE FROM "${SCHEMA}"."documents" WHERE id = 15`)
      await sqlRows(`DELETE FROM "payload"."documents" WHERE id = 15`)
    }
    expect((await verify()).ok).toBe(true)
  })

  it('--reconcile-deletes runs before the steps, so a re-keyed unique slug imports on the first run', async () => {
    const stories = await legacy('stories')
    const story = stories[0]
    const newId = Math.max(...stories.map((r) => r.id as number)) + 3 // inside the legacy sequence range
    await sqlRows(`UPDATE "${SCHEMA}"."stories" SET id = ${newId} WHERE id = ${story.id}`)
    try {
      const ctx = await runEtl({ update: true }, ['stories'], true)
      expect(ctx.report.counts('reconcile:stories').deleted).toBe(1)
      expect(ctx.report.counts('stories').created).toBe(1)
      expect((await verify(['stories'])).ok).toBe(true)
    } finally {
      await sqlRows(`UPDATE "${SCHEMA}"."stories" SET id = ${story.id} WHERE id = ${newId}`)
      await runEtl({ update: true }, ['stories'], true)
    }
    expect((await verify()).ok).toBe(true)
  })
})

// Cutover checklist B.3: the preview rehearsal writes with the preview store's token while the
// legacy rows point at the production store (`fakestore` here; the storage plugin's fake store).
describe('legacy ETL, two stores (preview rehearsal)', () => {
  const PREVIEW_TOKEN = 'vercel_blob_rw_previewstore_x'
  const PROD = 'https://fakestore.public.blob.vercel-storage.com/'
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f \ntrailer<</Root 1 0 R>>\nstartxref\n9\n%%EOF\n', 'latin1')
  const png = readFileSync(path.resolve('public/apple-touch-icon.png'))
  const jpg = readFileSync(path.resolve('public/og-image.jpg'))
  const BY_EXT: Record<string, [Buffer, string]> = { pdf: [pdf, 'application/pdf'], png: [png, 'image/png'], jpg: [jpg, 'image/jpeg'] }
  const SPECIAL: Record<string, [Buffer, string]> = {
    // A mis-named file is accepted and stored with its real type (head() is skipped on a two-store run).
    [`${PROD}gallery/photo-01.jpg`]: [png, 'image/png'],
    // Bytes Payload's upload restrictions reject: reported, not fatal.
    [`${PROD}players/headshot.jpg`]: [Buffer.from('not an image'), 'image/jpeg'],
  }

  it('registers legacy blobs in place, re-uploads fallbacks from GETs, reports a rejected file, and is idempotent', async () => {
    await wipeTarget()
    blob.head.mockClear()
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (input: unknown, init?: { method?: string }) => {
      const url = String(input)
      if (init?.method === 'HEAD') return new Response(null, { status: 200 })
      const [body, type] = SPECIAL[url] ?? BY_EXT[url.split('.').pop()!] ?? [Buffer.from(''), 'application/octet-stream']
      return new Response(new Uint8Array(body), { status: 200, headers: { 'content-type': type } })
    })
    try {
      const ctx = await runEtl({ token: PREVIEW_TOKEN, storeId: 'fakestore' })
      expect(blob.head).not.toHaveBeenCalled()
      const gets = fetchSpy.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method !== 'HEAD').map(([u]) => String(u))
      expect(gets.length).toBeGreaterThan(0)
      expect(gets.every((u) => u.startsWith(PROD))).toBe(true)
      expect(ctx.report.media.register).toBeGreaterThan(0)
      expect(ctx.report.media['fallback-reupload']).toBeGreaterThan(0)
      expect(ctx.report.media['fallback-local'] ?? 0).toBe(0)
      const kinds = ctx.report.items.map((i) => `${i.kind} ${i.table}#${i.id}`)
      expect(kinds).toContain('media-fallback-failed players#6')
      expect(ctx.report.files.get(`media ${PROD}players/headshot.jpg`)).toBe('fallback-failed')
      expect(ctx.report.media['fallback-failed']).toBe(1)
      expect(ctx.report.counts('players').created).toBe(6)
      const { docs: [photo] } = await payload.find({ collection: 'gallery-photos', where: { legacyUrl: { equals: `${PROD}gallery/photo-01.jpg` } }, overrideAccess: true })
      expect(photo.mimeType).toBe('image/png')

      const result = await verify(undefined, { token: PREVIEW_TOKEN, headSample: 1000 })
      const failures = failuresOf(result)
      expect(failures.split('\n').filter((f) => f && !f.includes('players#6'))).toEqual([])
      const heads = fetchSpy.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method === 'HEAD').map(([u]) => String(u))
      expect(heads.length).toBeGreaterThan(0)

      // Duplicate URLs: the original blob is downloaded and re-uploaded under -dup<id> names.
      const original = `${PROD}documents/game-day-training-checklist-Qx7Lm2Pa9RtYb3Kd8WcZs1.pdf`
      expect(gets.filter((u) => u === original)).toHaveLength(1) // registered in place, so only the copy downloads it
      expect(ctx.report.media['duplicate-copy']).toBe(4)
      expect(ctx.report.media['duplicate-copy-local'] ?? 0).toBe(0)
      const copy = (await payload.findByID({ collection: 'documents', id: 10, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
      expect(copy).toMatchObject({ filename: 'game-day-training-checklist-Qx7Lm2Pa9RtYb3Kd8WcZs1-dup10.pdf', prefix: 'documents', legacyUrl: original })
      expect(blob.put.mock.calls.map(([p]) => String(p))).toContain('documents/game-day-training-checklist-Qx7Lm2Pa9RtYb3Kd8WcZs1-dup10.pdf')
      expect(blob.put.mock.calls.map(([p]) => String(p))).not.toContain('documents/game-day-training-checklist-Qx7Lm2Pa9RtYb3Kd8WcZs1.pdf')

      const before = await snapshot()
      blob.put.mockClear()
      fetchSpy.mockClear()
      const again = await runEtl({ token: PREVIEW_TOKEN, storeId: 'fakestore' })
      expect(blob.put).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(again.report.writes()).toBe(0)
      expect(await snapshot()).toEqual(before)
    } finally {
      fetchSpy.mockReset()
    }
  })
})
