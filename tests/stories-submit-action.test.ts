import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown> | null = null

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v
        return Promise.resolve()
      },
    }),
  },
}))

beforeEach(() => {
  inserted = null
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const SAMPLE_DOC = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My first season with the seniors.' }] }],
})

const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

describe('submitStory', () => {
  it('inserts a pending row for a valid submission', async () => {
    const { submitStory } = await import('@/app/history/submit/actions')
    await expect(
      submitStory(formData({ authorName: 'Pat Smith', title: 'My First Season', contentJson: SAMPLE_DOC }))
    ).rejects.toBeDefined() // next/navigation's redirect() always throws, even on success

    expect(inserted).toMatchObject({
      title: 'My First Season',
      authorName: 'Pat Smith',
      status: 'pending',
      submittedByAdmin: false,
    })
  })

  it('rejects submissions missing required fields without inserting anything', async () => {
    const { submitStory } = await import('@/app/history/submit/actions')
    await expect(
      submitStory(formData({ authorName: '', title: '', contentJson: SAMPLE_DOC }))
    ).rejects.toThrow('Name, title and story body are required.')
    expect(inserted).toBeNull()
  })

  it('rejects a body with no real text without inserting anything', async () => {
    const { submitStory } = await import('@/app/history/submit/actions')
    await expect(
      submitStory(formData({ authorName: 'Pat Smith', title: 'Empty Story', contentJson: EMPTY_DOC }))
    ).rejects.toThrow('Story body cannot be empty.')
    expect(inserted).toBeNull()
  })

  it('silently no-ops when the honeypot field is filled in', async () => {
    const { submitStory } = await import('@/app/history/submit/actions')
    await expect(
      submitStory(
        formData({
          authorName: 'Bot',
          title: 'Buy now',
          contentJson: SAMPLE_DOC,
          website: 'http://spam.example',
        })
      )
    ).rejects.toBeDefined() // redirect() throws
    expect(inserted).toBeNull()
  })
})
