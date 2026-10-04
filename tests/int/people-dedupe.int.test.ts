/**
 * people-dedupe.int: the operator merge of duplicate people rows (lib/people-dedupe.ts) against the
 * local test DB, plus the script's database guard.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runDedupe } from '../../payload/scripts/dedupe-people-lib'
import { checkGuard } from '../../payload/scripts/_guard'
import { clearCollection, destroyTestPayload, getTestPayload } from './helpers'
import { resetPlayers } from './players-helpers'

const ctx = { disableRevalidate: true }
let payload: Payload
let media: { id: number }
let player: { id: number }

const make = (data: Record<string, unknown>) =>
  payload.create({ collection: 'people', data: { name: 'Russell Savige', role: 'Role', ...data } as never, context: ctx, overrideAccess: true })
const all = async () => (await payload.find({ collection: 'people', pagination: false, depth: 0, sort: 'id', overrideAccess: true })).docs

beforeAll(async () => {
  payload = await getTestPayload()
  await clearCollection(payload, 'people')
  await resetPlayers(payload)
  media = await payload.create({
    collection: 'media',
    data: { filename: 'dedupe.jpg', prefix: 'dedupe-test', mimeType: 'image/jpeg', focalX: 50, focalY: 50, alt: 'x', legacyUrl: 'https://legacy.test/dedupe.jpg' },
    context: { etl: true, disableRevalidate: true },
  })
  player = await payload.create({ collection: 'players', data: { firstName: 'Russell', lastName: 'Savige' }, context: ctx })
})
beforeEach(() => clearCollection(payload, 'people'))
afterAll(async () => {
  await clearCollection(payload, 'people')
  await resetPlayers(payload)
  await payload.delete({ collection: 'media', id: media.id, context: { etl: true, disableRevalidate: true } }).catch(() => undefined)
  await destroyTestPayload(payload)
})

describe('dedupe people', () => {
  it('dry run writes nothing', async () => {
    await make({ role: 'Senior Leadership Team', section: 'leadership', photo: media.id })
    await make({ role: 'First Aid Officer', phone: '0400 111 111' })
    const lines: string[] = []
    const groups = await runDedupe(payload, { apply: false, log: (l) => lines.push(l) })
    expect(groups).toHaveLength(1)
    expect(lines.join('\n')).toContain('dry run')
    expect(await all()).toHaveLength(2)
  })

  it('merges into the row with the photo, copies empty fields, adds the other role, deletes the duplicate', async () => {
    const a = await make({ role: 'Senior Leadership Team', section: 'leadership', photo: media.id })
    const b = await make({ role: 'First Aid Officer', section: 'committee', phone: '0400 111 111', email: 'r@x.com', player: player.id })
    await runDedupe(payload, { apply: true })
    const rows = await all()
    expect(rows.map((r) => r.id)).toEqual([a.id])
    expect(rows[0]).toMatchObject({ phone: '0400 111 111', email: 'r@x.com', section: 'leadership' })
    expect(typeof rows[0]!.photo === 'number' ? rows[0]!.photo : (rows[0]!.photo as { id: number }).id).toBe(media.id)
    expect(typeof rows[0]!.player === 'number' ? rows[0]!.player : (rows[0]!.player as { id: number }).id).toBe(player.id)
    expect(rows[0]!.moreRoles?.map((r) => [r.role, r.section])).toEqual([['First Aid Officer', 'committee']])
    expect(rows.some((r) => r.id === b.id)).toBe(false)
  })

  it('is idempotent', async () => {
    await make({ role: 'Senior Leadership Team', section: 'leadership', photo: media.id })
    await make({ role: 'First Aid Officer' })
    await runDedupe(payload, { apply: true })
    const lines: string[] = []
    const groups = await runDedupe(payload, { apply: true, log: (l) => lines.push(l) })
    expect(groups).toEqual([])
    expect(lines.join('\n')).toContain('nothing to do')
    const rows = await all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.moreRoles).toHaveLength(1)
  })

  it('skips a group whose phones conflict, and merges it with preferPrimary keeping the primary value', async () => {
    await make({ role: 'Senior Leadership Team', section: 'leadership', photo: media.id, phone: '0400 111 111' })
    await make({ role: 'First Aid Officer', phone: '0400 999 999' })
    const lines: string[] = []
    await runDedupe(payload, { apply: true, log: (l) => lines.push(l) })
    expect(lines.join('\n')).toContain('CONFLICT phone')
    expect(await all()).toHaveLength(2)
    await runDedupe(payload, { apply: true, preferPrimary: true })
    const rows = await all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.phone).toBe('0400 111 111')
  })

  it('guard refuses a non-local target without the operator flags', () => {
    const argv = ['--target', 'db.example.com/prod']
    const env = { DATABASE_URI: 'postgres://u:p@db.example.com:5432/prod' }
    expect(() => checkGuard({ write: true }, argv, env)).toThrow(/not local/)
    expect(() => checkGuard({ write: true }, argv, { ...env, ALLOW_REMOTE_DB: 'yes' })).toThrow(/--confirm/)
    expect(() => checkGuard({ write: false }, ['--target', 'wrong/db'], env)).toThrow(/does not match/)
    expect(() => checkGuard({ write: false }, [], env)).toThrow(/--target/)
    expect(checkGuard({ write: true }, [...argv, '--confirm'], { ...env, ALLOW_REMOTE_DB: 'yes' }).confirmed).toBe(true)
  })
})
