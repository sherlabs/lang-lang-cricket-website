import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown> | null = null
let updated: Record<string, unknown> | null = null

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/auth', () => ({ COOKIE_NAME: 'llcc_admin_session', verifySessionCookie: async () => true }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v
        return Promise.resolve()
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        updated = v
        return { where: () => Promise.resolve() }
      },
    }),
  },
}))

beforeEach(() => {
  inserted = null
  updated = null
})

describe('createAnnouncement', () => {
  it('rejects a missing title', async () => {
    const { createAnnouncement } = await import('@/app/admin/(shell)/announcements/actions')
    await expect(createAnnouncement({ title: '', body: 'hello', published: true })).rejects.toThrow(
      'Title is required.'
    )
    expect(inserted).toBeNull()
  })

  it('rejects a whitespace-only title', async () => {
    const { createAnnouncement } = await import('@/app/admin/(shell)/announcements/actions')
    await expect(createAnnouncement({ title: '   ', body: '', published: false })).rejects.toThrow(
      'Title is required.'
    )
    expect(inserted).toBeNull()
  })

  it('stores a trimmed title and body', async () => {
    const { createAnnouncement } = await import('@/app/admin/(shell)/announcements/actions')
    await createAnnouncement({ title: '  Big News  ', body: '  details  ', published: true })
    expect(inserted).toMatchObject({ title: 'Big News', body: 'details', published: true })
  })
})

describe('updateAnnouncement', () => {
  it('rejects a missing title', async () => {
    const { updateAnnouncement } = await import('@/app/admin/(shell)/announcements/actions')
    await expect(updateAnnouncement(1, { title: '', body: 'hello', published: true })).rejects.toThrow(
      'Title is required.'
    )
    expect(updated).toBeNull()
  })

  it('bumps updatedAt on save', async () => {
    const { updateAnnouncement } = await import('@/app/admin/(shell)/announcements/actions')
    await updateAnnouncement(1, { title: 'Updated', body: '', published: false })
    expect(updated).toMatchObject({ title: 'Updated', published: false })
    expect(updated!.updatedAt).toBeInstanceOf(Date)
  })
})
