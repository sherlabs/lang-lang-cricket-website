/**
 * A small stale-while-revalidate cache for the admin's theme (wave G WP-0). No `server-only` import and no Payload import, so the
 * `theme` and `club` global hooks can clear it and a unit test can drive it with a fake clock.
 *
 * Why it exists: the admin layout used to await the theme (two database reads) before streaming a single byte, so every hard load
 * of the admin started with a blank cream page. With this cache a warm instance answers instantly; a stale value (older than the
 * TTL) is served while one refresh runs; and a cold or failing read costs at most `budgetMs` before the seed theme is used for that
 * render. The real theme replaces the seed on the next render once the background read has finished. Failures are never cached.
 */
export type SwrCache<T> = {
  /** The cached value, or the fallback if there is none within the wait budget. Never rejects. */
  get(read: () => Promise<T>, fallback: () => T): Promise<{ value: T; source: 'fresh' | 'stale' | 'read' | 'fallback' }>
  /** Forget the value (a global changed on this instance). A read that started before this is ignored when it lands. */
  invalidate(): void
}

export function createSwrCache<T>(opts: { ttlMs?: number; budgetMs?: number; now?: () => number; onError?: (err: unknown) => void } = {}): SwrCache<T> {
  const ttl = opts.ttlMs ?? 60_000
  const budget = opts.budgetMs ?? 1500
  const now = opts.now ?? Date.now
  let value: T | undefined
  let hasValue = false
  let at = 0
  let generation = 0
  let inflight: Promise<void> | undefined

  const refresh = (read: () => Promise<T>): Promise<void> => {
    if (inflight !== undefined) return inflight
    const started = generation
    const run: Promise<void> = read()
      .then((next) => {
        if (started !== generation) return // invalidated while reading: this answer may be from before the change
        value = next
        hasValue = true
        at = now()
      })
      .catch((err: unknown) => opts.onError?.(err))
      .finally(() => {
        if (inflight === run) inflight = undefined
      })
    inflight = run
    return run
  }

  return {
    invalidate() {
      generation += 1
      value = undefined
      hasValue = false
      inflight = undefined
    },
    async get(read, fallback) {
      if (hasValue) {
        const age = now() - at
        if (age > ttl) {
          void refresh(read)
          return { value: value as T, source: 'stale' }
        }
        return { value: value as T, source: 'fresh' }
      }
      const pending = refresh(read)
      let timer: ReturnType<typeof setTimeout> | undefined
      const waited = await Promise.race([pending.then(() => 'done' as const), new Promise<'late'>((resolve) => { timer = setTimeout(() => resolve('late'), budget) })])
      if (timer !== undefined) clearTimeout(timer)
      if (waited === 'done' && hasValue) return { value: value as T, source: 'read' }
      return { value: fallback(), source: 'fallback' }
    },
  }
}

const KEY = Symbol.for('club.adminThemeCache')
type Holder = { [KEY]?: SwrCache<unknown> }

/** One cache per server instance, shared by every bundle that imports this module. */
export function adminThemeCache<T>(): SwrCache<T> {
  const holder = globalThis as Holder
  holder[KEY] ??= createSwrCache<unknown>()
  return holder[KEY] as SwrCache<T>
}

/** Next data-cache tag for the theme shared by every instance (`lib/theme.ts`), expired by the same hooks. */
export const ADMIN_THEME_TAG = 'admin-theme'

/** Called by the `theme` and `club` globals' afterChange hooks: the next admin render on this instance reads the new values. */
export function invalidateAdminTheme(): void {
  adminThemeCache().invalidate()
}
