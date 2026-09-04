import { describe, it, expect, vi } from 'vitest'

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
})
