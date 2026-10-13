/** The shared cleanup helpers (WP-0): dropTestUsers removes users and every row that references them, cleanTestTables empties named tables. */
import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanTestTables, destroyTestPayload, dropTestUsers, getTestPayload, tokenFor, wipeTestData } from './helpers'

let payload: Payload
const ctx = { disableRevalidate: true }
const count = async (table: string) => Number(((await payload.db.drizzle.execute(sql.raw(`SELECT count(*)::int AS n FROM payload."${table}"`))) as unknown as { rows: { n: number }[] }).rows[0].n)

beforeAll(async () => {
  payload = await getTestPayload()
})
afterAll(async () => {
  await wipeTestData(payload)
  await destroyTestPayload(payload)
})

describe('test cleanup helpers', () => {
  it('dropTestUsers removes users, their sessions and the yearbooks that point at them', async () => {
    await tokenFor(payload, 'admin', 'drop-me@example.com')
    const user = (await payload.find({ collection: 'users', where: { email: { equals: 'drop-me@example.com' } }, limit: 1 })).docs[0]
    await payload.create({ collection: 'yearbooks', data: { title: 'Mine', seasonName: 'Summer 2025/26' } as never, context: ctx })
    await payload.db.drizzle.execute(sql.raw(`UPDATE payload.yearbooks SET season_summary_checked_by_id = ${user.id}`))
    expect(await count('users_sessions')).toBeGreaterThan(0)
    await dropTestUsers(payload, ['drop-me@example.com'])
    expect(await count('users')).toBe(0)
    expect(await count('users_sessions')).toBe(0)
    expect(await count('yearbooks')).toBe(0)
  })
  it('cleanTestTables empties the named tables and dropTestUsers with no match is a no-op', async () => {
    await payload.create({ collection: 'yearbooks', data: { title: 'Loose', seasonName: 'Summer 2024/25' } as never, context: ctx })
    await cleanTestTables(payload, ['yearbooks'])
    expect(await count('yearbooks')).toBe(0)
    await dropTestUsers(payload, ['nobody@example.com'])
  })
})
