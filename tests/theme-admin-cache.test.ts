import { describe, expect, it, vi } from 'vitest'
import { createSwrCache } from '@/lib/theme/admin-cache'

const clock = () => { let t = 1_000; return { now: () => t, advance: (ms: number) => { t += ms } } }
const deferred = <T,>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

describe('admin theme cache (stale while revalidate)', () => {
  it('reads once, then serves the cached value without reading again', async () => {
    const c = clock()
    const cache = createSwrCache<string>({ now: c.now })
    const read = vi.fn(async () => 'real')
    expect((await cache.get(read, () => 'seed')).value).toBe('real')
    expect(await cache.get(read, () => 'seed')).toEqual({ value: 'real', source: 'fresh' })
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('serves a stale value (older than the TTL) while exactly one refresh runs', async () => {
    const c = clock()
    const cache = createSwrCache<string>({ now: c.now, ttlMs: 60_000 })
    await cache.get(async () => 'v1', () => 'seed')
    c.advance(61_000)
    const next = deferred<string>()
    const read = vi.fn(() => next.promise)
    expect(await cache.get(read, () => 'seed')).toEqual({ value: 'v1', source: 'stale' })
    expect(await cache.get(read, () => 'seed')).toEqual({ value: 'v1', source: 'stale' })
    expect(read).toHaveBeenCalledTimes(1)
    next.resolve('v2')
    await Promise.resolve(); await Promise.resolve()
    expect((await cache.get(read, () => 'seed')).value).toBe('v2')
  })

  it('invalidate (a global changed) makes the next render read the new value', async () => {
    const cache = createSwrCache<string>()
    await cache.get(async () => 'old', () => 'seed')
    cache.invalidate()
    expect((await cache.get(async () => 'new', () => 'seed')).value).toBe('new')
  })

  it('ignores a read that started before an invalidation', async () => {
    const cache = createSwrCache<string>({ budgetMs: 5 })
    const slow = deferred<string>()
    expect((await cache.get(() => slow.promise, () => 'seed')).source).toBe('fallback')
    cache.invalidate()
    slow.resolve('from before the change')
    await Promise.resolve(); await Promise.resolve()
    expect((await cache.get(async () => 'after', () => 'seed')).value).toBe('after')
  })

  it('an empty cache with a slow read returns the seed within the budget, and the real value on the next render', async () => {
    const cache = createSwrCache<string>({ budgetMs: 10 })
    const slow = deferred<string>()
    const t0 = Date.now()
    const first = await cache.get(() => slow.promise, () => 'seed')
    expect(first).toEqual({ value: 'seed', source: 'fallback' })
    expect(Date.now() - t0).toBeLessThan(500)
    slow.resolve('real')
    await Promise.resolve(); await Promise.resolve()
    expect(await cache.get(async () => 'unused', () => 'seed')).toEqual({ value: 'real', source: 'fresh' })
  })

  it('a failing read never throws, is not cached and is retried on the next render', async () => {
    const onError = vi.fn()
    const cache = createSwrCache<string>({ onError })
    expect(await cache.get(async () => { throw new Error('db down') }, () => 'seed')).toEqual({ value: 'seed', source: 'fallback' })
    expect(onError).toHaveBeenCalledTimes(1)
    expect((await cache.get(async () => 'back', () => 'seed')).value).toBe('back')
  })
})
