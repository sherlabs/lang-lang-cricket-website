const HOST = 'https://api.playhq.com'

export const PLAYHQ_ORG_ID = process.env.PLAYHQ_ORG_ID ?? '484ced51-403a-466c-9a94-bd95eedf7319'

export class PlayHQError extends Error {
  constructor(public status: number, public path: string) {
    super(`PlayHQ ${status} for ${path}`)
    this.name = 'PlayHQError'
  }
}

export type FetchOpts = { revalidate: number; tags?: string[] }

function headers() {
  const key = process.env.PLAYHQ_CLIENT_ID
  if (!key) throw new PlayHQError(0, 'PLAYHQ_CLIENT_ID not set')
  return {
    'x-api-key': key,
    'x-phq-tenant': process.env.PLAYHQ_TENANT ?? 'ca',
    accept: 'application/json',
  }
}

export async function phqFetch<T>(path: string, opts: FetchOpts): Promise<T> {
  const res = await fetch(`${HOST}${path}`, {
    headers: headers(),
    next: { revalidate: opts.revalidate, tags: ['playhq', ...(opts.tags ?? [])] },
  })
  if (!res.ok) throw new PlayHQError(res.status, path)
  return (await res.json()) as T
}

type Page<T> = { data: T[]; metadata?: { hasMore: boolean; nextCursor: string | null } }

export async function phqFetchAll<T>(path: string, opts: FetchOpts): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  do {
    const sep = path.includes('?') ? '&' : '?'
    const page: Page<T> = await phqFetch<Page<T>>(cursor ? `${path}${sep}cursor=${cursor}` : path, opts)
    out.push(...page.data)
    cursor = page.metadata?.hasMore ? page.metadata.nextCursor : null
  } while (cursor)
  return out
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
