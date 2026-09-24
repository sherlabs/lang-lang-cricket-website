import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown>[] | null = null
let deletedId: number | null = null

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/auth', () => ({ COOKIE_NAME: 'llcc_admin_session', verifySessionCookie: async () => true }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]), orderBy: () => Promise.resolve([]) }) }),
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
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
}))

beforeEach(() => {
  inserted = null
  deletedId = null
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
