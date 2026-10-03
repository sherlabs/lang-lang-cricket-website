import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload } from './helpers'

// Proves the int harness (guarded test DB, migrations, Local API) before later WPs rely on it.
describe('int smoke', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'media')
    await clearCollection(payload, 'users')
  })

  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('runs against the local *_test database in schema payload', async () => {
    expect(process.env.DATABASE_URI).toMatch(/_test$/)
    const res = await payload.db.pool.query(`select count(*)::int as n from information_schema.tables where table_schema = 'payload'`)
    expect(res.rows[0].n).toBeGreaterThan(3)
  })

  it('creates a user through the seed context', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: 'smoke@example.com', password: 'smoke-pass-123', role: 'admin' },
      context: { seedAdmin: true, disableRevalidate: true },
    })
    expect(user.role).toBe('admin')
  })

  it('registers an existing blob as a media doc (spec §7.4 recipe, plugin disabled)', async () => {
    const doc = await payload.create({
      collection: 'media',
      data: { filename: 'smoke-Ab12Cd34.jpg', prefix: 'players', mimeType: 'image/jpeg', filesize: 1234, focalX: 50, focalY: 50, alt: '' },
      context: { disableRevalidate: true },
    })
    expect(doc.filename).toBe('smoke-Ab12Cd34.jpg')
    expect(doc.prefix).toBe('players')
    expect(doc.legacyUrl ?? null).toBeNull()
  })
})
