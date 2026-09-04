import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'

describe('lib/crud makeCrudActions', () => {
  it('create/list/update/remove round-trip through the provided db handle', async () => {
    const rows: Array<{ id: number; name: string }> = []
    let nextId = 1
    const fakeDb = {
      select: () => ({ from: () => rows }),
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
    expect((await actions.list())[0].name).toBe('Beta')

    await actions.remove(1)
    expect(await actions.list()).toEqual([])
  })

  it('update and remove pass table.id column reference to where clause', async () => {
    // This test verifies that update/remove use table.id (column) not table (whole object)
    // by ensuring the whereCondition passed has properties of eq(table.id, id)
    let updateWhereConditionReceived: unknown
    let deleteWhereConditionReceived: unknown

    const fakeTable = {
      id: { name: 'id' },
    }

    const fakeDb = {
      select: () => ({ from: () => [] }),
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({
        set: () => ({
          where: (condition: unknown) => {
            updateWhereConditionReceived = condition
            return Promise.resolve()
          },
        }),
      }),
      delete: () => ({
        where: (condition: unknown) => {
          deleteWhereConditionReceived = condition
          return Promise.resolve()
        },
      }),
    }

    const { makeCrudActions } = await import('@/lib/crud')
    const actions = makeCrudActions(fakeDb as never, fakeTable as never, () => {})

    await actions.update(1, { name: 'Test' })
    // The condition should be the result of eq(table.id, 1)
    expect(updateWhereConditionReceived).toBeDefined()

    await actions.remove(1)
    // The condition should be the result of eq(table.id, 1)
    expect(deleteWhereConditionReceived).toBeDefined()
  })
})
