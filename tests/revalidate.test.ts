import { beforeEach, describe, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => ({
  revalidatePath: vi.fn(() => {
    throw new Error('Invariant: static generation store missing in revalidatePath /')
  }),
  revalidateTag: vi.fn(() => {
    throw new Error('outside a request')
  }),
}))
vi.mock('next/cache', () => cache)

import { revalidateAfterChange, revalidateAfterDelete, revalidatePaths } from '@/payload/hooks/revalidate'

beforeEach(() => {
  cache.revalidatePath.mockClear()
  cache.revalidateTag.mockClear()
})

describe('revalidate hook helpers', () => {
  it('never throw outside a request', async () => {
    await expect(revalidatePaths(['/', '/sponsors'], {}, ['playhq'])).resolves.toBeUndefined()
    expect(cache.revalidatePath).toHaveBeenCalledTimes(2)
    expect(cache.revalidateTag).toHaveBeenCalledWith('playhq', { expire: 0 })
  })

  it('are a no-op with context.disableRevalidate', async () => {
    await revalidatePaths(['/'], { disableRevalidate: true })
    expect(cache.revalidatePath).not.toHaveBeenCalled()
  })

  it('collection hooks revalidate old and new paths and return the doc', async () => {
    const hook = revalidateAfterChange((doc) => [`/players/${doc.slug}`])
    const doc = { slug: 'new' }
    const req = { context: {} }
    const out = await hook({ doc, previousDoc: { slug: 'old' }, req } as never)
    expect(out).toBe(doc)
    expect(cache.revalidatePath.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['/players/new', '/players/old'])
    const del = revalidateAfterDelete(['/'])
    expect(await del({ doc, req } as never)).toBe(doc)
  })

  it('collection hooks pass cache tags through', async () => {
    const doc = { slug: 'a' }
    await revalidateAfterChange(['/players'], ['player-stats'])({ doc, req: { context: {} } } as never)
    await revalidateAfterDelete(['/players'], ['player-stats'])({ doc, req: { context: {} } } as never)
    expect(cache.revalidateTag.mock.calls).toEqual([['player-stats', { expire: 0 }], ['player-stats', { expire: 0 }]])
  })
})
