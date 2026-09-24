import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown>[] | null = null
let deletedId: number | null = null
let updated: { id: number; values: Record<string, unknown> } | null = null
let selectRows: Record<string, unknown>[] = []
let delUrl: string | null = null

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/auth', () => ({ COOKIE_NAME: 'llcc_admin_session', verifySessionCookie: async () => true }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@vercel/blob', () => ({
  del: (url: string) => {
    delUrl = url
    return Promise.resolve()
  },
}))

// eq/and are replaced with plain tagged objects so `where(...)` below can
// genuinely filter `selectRows`, the same approach used in
// tests/events-queries.test.ts, needed to exercise listPendingEventPhotos'
// eventId + status filtering rather than assuming it works untested.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (column: unknown, value: unknown) => ({ __op: 'eq' as const, column, value }),
    and: (...conditions: unknown[]) => ({ __op: 'and' as const, conditions }),
  }
})

vi.mock('@/db', async () => {
  const schema = await import('@/db/schema')
  const columnKey = new Map<unknown, string>([
    [schema.eventPhotos.eventId, 'eventId'],
    [schema.eventPhotos.status, 'status'],
    [schema.eventPhotos.id, 'id'],
  ])
  function matches(row: Record<string, unknown>, cond: unknown): boolean {
    const c = cond as { __op: string; column?: unknown; value?: unknown; conditions?: unknown[] }
    if (c.__op === 'and') return (c.conditions ?? []).every((sub) => matches(row, sub))
    if (c.__op === 'eq') return row[columnKey.get(c.column) ?? ''] === c.value
    return true
  }
  return {
    db: {
      select: () => ({
        from: () =>
          Object.assign(Promise.resolve(selectRows), {
            where: (cond: unknown) => {
              const filtered = selectRows.filter((r) => matches(r, cond))
              return Object.assign(Promise.resolve(filtered), { orderBy: () => Promise.resolve(filtered) })
            },
            orderBy: () => Promise.resolve(selectRows),
          }),
      }),
      insert: () => ({
        values: (v: Record<string, unknown>[]) => {
          inserted = v
          return Promise.resolve()
        },
      }),
      delete: () => ({
        where: () => {
          deletedId = 1
          return Promise.resolve()
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            updated = { id: 1, values }
            return Promise.resolve()
          },
        }),
      }),
    },
  }
})

beforeEach(() => {
  inserted = null
  deletedId = null
  updated = null
  selectRows = []
  delUrl = null
})

describe('deleteRsvp', () => {
  it('deletes the row', async () => {
    const { deleteRsvp } = await import('@/app/admin/(shell)/events/rsvp-actions')
    await deleteRsvp(1)
    expect(deletedId).toBe(1)
  })
})

describe('addEventPhotos', () => {
  it('inserts one row per URL scoped to the event', async () => {
    const { addEventPhotos } = await import('@/app/admin/(shell)/events/photo-actions')
    await addEventPhotos(7, ['https://x.public.blob.vercel-storage.com/a.jpg', 'https://x.public.blob.vercel-storage.com/b.jpg'])
    expect(inserted).toHaveLength(2)
    expect(inserted![0]).toMatchObject({ eventId: 7, url: 'https://x.public.blob.vercel-storage.com/a.jpg' })
  })

  it('ignores non-Blob URLs', async () => {
    const { addEventPhotos } = await import('@/app/admin/(shell)/events/photo-actions')
    await addEventPhotos(7, ['https://evil.example.com/a.jpg'])
    expect(inserted).toBeNull()
  })
})

describe('listPendingEventPhotos', () => {
  it('returns only pending photos for the given event, excluding approved photos and other events\' pending photos', async () => {
    selectRows = [
      { id: 1, eventId: 7, url: 'https://x.public.blob.vercel-storage.com/pending.jpg', status: 'pending', submitterName: 'Pat' },
      { id: 2, eventId: 7, url: 'https://x.public.blob.vercel-storage.com/approved.jpg', status: 'approved', submitterName: '' },
      { id: 3, eventId: 8, url: 'https://x.public.blob.vercel-storage.com/other-event.jpg', status: 'pending', submitterName: 'Sam' },
    ]
    const { listPendingEventPhotos } = await import('@/app/admin/(shell)/events/photo-actions')
    const rows = await listPendingEventPhotos(7)
    expect(rows).toEqual([selectRows[0]])
  })
})

describe('approveEventPhoto', () => {
  it('sets status to approved', async () => {
    const { approveEventPhoto } = await import('@/app/admin/(shell)/events/photo-actions')
    await approveEventPhoto(3)
    expect(updated).toMatchObject({ values: { status: 'approved' } })
  })
})

describe('rejectEventPhoto', () => {
  it('deletes the row and the underlying Blob file', async () => {
    selectRows = [{ id: 3, url: 'https://x.public.blob.vercel-storage.com/pending.jpg' }]
    const { rejectEventPhoto } = await import('@/app/admin/(shell)/events/photo-actions')
    await rejectEventPhoto(3)
    expect(deletedId).toBe(1)
    expect(delUrl).toBe('https://x.public.blob.vercel-storage.com/pending.jpg')
  })

  it('does nothing if the photo is already gone', async () => {
    selectRows = []
    const { rejectEventPhoto } = await import('@/app/admin/(shell)/events/photo-actions')
    await rejectEventPhoto(999)
    expect(deletedId).toBeNull()
    expect(delUrl).toBeNull()
  })
})
