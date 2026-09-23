import { describe, it, expect, vi, beforeEach } from 'vitest'

// Setup: track eq calls for testing
const eqCalls: Array<[unknown, unknown]> = []

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')
  const eqImpl = (col: unknown, val: unknown) => {
    eqCalls.push([col, val])
    return actual.eq(col as never, val)
  }
  return {
    ...actual,
    eq: vi.fn(eqImpl),
  }
})

describe('lib/crud makeCrudActions', () => {
  it('create/list/update/remove round-trip through the provided db handle', async () => {
    const rows: Array<{ id: number; name: string }> = []
    let nextId = 1
    const fakeDb = {
      select: () => ({ from: (): Array<{ id: number; name: string }> => rows }),
      insert: () => ({
        values: (v: { name: string }) => {
          rows.push({ id: nextId++, name: v.name })
          return Promise.resolve()
        },
      }),
      update: () => ({
        set: (v: { name: string }) => ({
          where: () => {
            const row = rows.find((r) => r.id === 1)
            if (row) row.name = v.name
            return Promise.resolve()
          },
        }),
      }),
      delete: () => ({
        where: () => {
          const idx = rows.findIndex((r) => r.id === 1)
          if (idx >= 0) rows.splice(idx, 1)
          return Promise.resolve()
        },
      }),
    }

    const { makeCrudActions } = await import('@/lib/crud')
    const actions = makeCrudActions(fakeDb as never, {} as never, () => {})

    await actions.create({ name: 'Alpha' })
    expect(await actions.list()).toEqual([{ id: 1, name: 'Alpha' }])

    await actions.update(1, { name: 'Beta' })
    const list = (await actions.list()) as Array<{ id: number; name: string }>
    expect(list[0].name).toBe('Beta')

    await actions.remove(1)
    expect(await actions.list()).toEqual([])
  })

  it('update and remove call eq() with the id column, not the table', async () => {
    const fakeTable = { id: { name: 'id' } }
    const fakeDb = {
      select: () => ({ from: () => [] }),
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      delete: () => ({ where: () => Promise.resolve() }),
    }

    eqCalls.length = 0

    const { makeCrudActions } = await import('@/lib/crud')
    const actions = makeCrudActions(fakeDb as never, fakeTable as never, () => {})

    await actions.update(1, { name: 'Test' })
    expect(eqCalls).toContainEqual([fakeTable.id, 1])

    eqCalls.length = 0

    await actions.remove(1)
    expect(eqCalls).toContainEqual([fakeTable.id, 1])
  })
})
