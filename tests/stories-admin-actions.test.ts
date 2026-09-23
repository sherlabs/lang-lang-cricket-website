import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown> | null = null
let updated: Record<string, unknown> | null = null

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name === 'llcc_admin_session' ? { value: 'valid-token' } : undefined),
  }),
}))

vi.mock('@/lib/auth', () => ({
  COOKIE_NAME: 'llcc_admin_session',
  verifySessionCookie: async () => true,
}))

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v
        return Promise.resolve()
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated = v
          return Promise.resolve()
        },
      }),
    }),
  },
}))

beforeEach(() => {
  inserted = null
  updated = null
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const SAMPLE_DOC = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A short story about round six.' }] }],
})

const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

describe('createStory', () => {
  it('publishes immediately with a generated slug and derived excerpt', async () => {
    const { createStory } = await import('@/app/admin/(shell)/stories/actions')
    await createStory(formData({ title: 'Grand Final Recap', contentJson: SAMPLE_DOC }))

    expect(inserted).toMatchObject({
      slug: 'grand-final-recap',
      title: 'Grand Final Recap',
      status: 'published',
      submittedByAdmin: true,
      authorName: 'Lang Lang Cricket Club',
    })
    expect((inserted!.excerpt as string)).toContain('A short story about round six.')
    expect(inserted!.publishedAt).toBeInstanceOf(Date)
  })

  it('rejects a story with no title', async () => {
    const { createStory } = await import('@/app/admin/(shell)/stories/actions')
    await expect(createStory(formData({ title: '', contentJson: SAMPLE_DOC }))).rejects.toThrow(
      'Title is required.'
    )
  })

  it('rejects an empty-doc submission without inserting anything', async () => {
    const { createStory } = await import('@/app/admin/(shell)/stories/actions')
    await expect(
      createStory(formData({ title: 'Empty Story', contentJson: EMPTY_DOC }))
    ).rejects.toThrow('Story body cannot be empty.')
    expect(inserted).toBeNull()
  })
})

describe('approveStory / rejectStory', () => {
  it('approveStory publishes and stamps publishedAt/reviewedAt', async () => {
    const { approveStory } = await import('@/app/admin/(shell)/stories/actions')
    await approveStory(1)
    expect(updated).toMatchObject({ status: 'published' })
    expect(updated!.publishedAt).toBeInstanceOf(Date)
    expect(updated!.reviewedAt).toBeInstanceOf(Date)
  })

  it('rejectStory marks rejected without setting publishedAt', async () => {
    const { rejectStory } = await import('@/app/admin/(shell)/stories/actions')
    await rejectStory(1)
    expect(updated).toMatchObject({ status: 'rejected' })
    expect(updated!.publishedAt).toBeUndefined()
    expect(updated!.reviewedAt).toBeInstanceOf(Date)
  })
})
