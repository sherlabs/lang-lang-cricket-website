import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown> | null = null
let eventRow: Record<string, unknown> | null = null
let fixedNow: Date | null = null

// Pin "now" the same way tests/events-rsvp-action.test.ts does, so a fixture
// event's "past" / "future" status stays correct regardless of when this
// suite actually runs.
vi.mock('@/lib/event-occurrences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-occurrences')>()
  return {
    ...actual,
    nowAsEventClock: (now?: Date) => (fixedNow ? new Date(fixedNow) : actual.nowAsEventClock(now)),
  }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(eventRow ? [eventRow] : []) }) }),
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
  fixedNow = new Date('2026-06-01T12:00:00.000Z')
  // Matches the 'x.public.blob.vercel-storage.com' host used by fixture URLs
  // throughout this suite, so isOwnBlobUrl treats them as this project's own
  // store.
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_x_secret'
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('submitEventPhoto', () => {
  it('inserts a pending photo for a valid past one-time event', async () => {
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-01-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(
      formData({
        eventId: '1',
        url: 'https://x.public.blob.vercel-storage.com/events/pending/a.jpg',
        submitterName: 'Pat',
        caption: 'Great day',
      })
    )
    expect(result).toBeUndefined()
    expect(inserted).toMatchObject({
      eventId: 1,
      url: 'https://x.public.blob.vercel-storage.com/events/pending/a.jpg',
      submitterName: 'Pat',
      caption: 'Great day',
      status: 'pending',
    })
  })

  it('rejects a future one-time event', async () => {
    eventRow = { id: 2, type: 'one_time', eventDate: new Date('2027-01-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: '2', url: 'https://x.public.blob.vercel-storage.com/a.jpg' }))
    expect(result).toEqual({ error: 'Photos can only be submitted for a past event.' })
    expect(inserted).toBeNull()
  })

  it('rejects a nonexistent event', async () => {
    eventRow = null
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: '999', url: 'https://x.public.blob.vercel-storage.com/a.jpg' }))
    expect(result).toEqual({ error: 'Event not found.' })
    expect(inserted).toBeNull()
  })

  it('rejects a recurring event (recap photos are one-time-event only)', async () => {
    eventRow = {
      id: 3,
      type: 'recurring',
      eventDate: null,
      eventTime: '18:00',
      dayOfWeek: 4,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-03-01T00:00:00Z'),
    }
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: '3', url: 'https://x.public.blob.vercel-storage.com/a.jpg' }))
    expect(result).toEqual({ error: 'Photos can only be submitted for a past event.' })
    expect(inserted).toBeNull()
  })

  it('rejects a missing/non-Blob url without inserting anything', async () => {
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-01-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: '1', url: 'https://evil.example.com/a.jpg' }))
    expect(result).toEqual({ error: 'A photo is required.' })
    expect(inserted).toBeNull()
  })

  it('rejects a Blob URL from outside events/pending/ (e.g. another entity\'s existing blob) without inserting anything', async () => {
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-01-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: '1', url: 'https://x.public.blob.vercel-storage.com/gallery/some-photo.jpg' }))
    expect(result).toEqual({ error: 'A photo is required.' })
    expect(inserted).toBeNull()
  })

  it('rejects a URL with the right events/pending/ path but a foreign store hostname', async () => {
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-01-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(
      formData({ eventId: '1', url: 'https://attacker-store.public.blob.vercel-storage.com/events/pending/a.jpg' })
    )
    expect(result).toEqual({ error: 'A photo is required.' })
    expect(inserted).toBeNull()
  })

  it('rejects a non-numeric eventId without crashing', async () => {
    eventRow = null
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: 'not-a-number', url: 'https://x.public.blob.vercel-storage.com/events/pending/a.jpg' }))
    expect(result).toEqual({ error: 'Event not found.' })
    expect(inserted).toBeNull()
  })

  it('accepts a mixed-case store id in BLOB_READ_WRITE_TOKEN by lowercasing before comparing to the hostname', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_AbC123_secret'
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-01-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(
      formData({ eventId: '1', url: 'https://abc123.public.blob.vercel-storage.com/events/pending/a.jpg' })
    )
    expect(result).toBeUndefined()
    expect(inserted).not.toBeNull()
  })

  it('truncates an overly long caption and submitterName instead of erroring', async () => {
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-01-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const longText = 'x'.repeat(500)
    const result = await submitEventPhoto(
      formData({ eventId: '1', url: 'https://x.public.blob.vercel-storage.com/events/pending/a.jpg', caption: longText, submitterName: longText })
    )
    expect(result).toBeUndefined()
    expect((inserted!.caption as string).length).toBe(200)
    expect((inserted!.submitterName as string).length).toBe(200)
  })
})
