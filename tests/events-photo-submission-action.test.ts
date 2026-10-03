import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { ValidationError } from 'payload'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

let fake: PayloadFake
let fixedNow: Date | null = null
const head = vi.fn(async (url: string, _opts?: unknown) => ({ url, size: 2048, contentType: 'image/jpeg' }))

// Pin "now" so a fixture event's "past" / "future" status stays correct whenever this runs.
vi.mock('@/lib/event-occurrences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-occurrences')>()
  return {
    ...actual,
    nowAsEventClock: (now?: Date) => (fixedNow ? new Date(fixedNow) : actual.nowAsEventClock(now)),
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@vercel/blob', () => ({ head: (url: string, opts?: unknown) => head(url, opts) }))
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))

// The fake Blob token (spec §1): store id `fakestore`. Never BLOB_READ_WRITE_TOKEN in tests.
const prevFake = process.env.PAYLOAD_BLOB_FAKE
process.env.PAYLOAD_BLOB_FAKE = '1'
afterAll(() => {
  if (prevFake === undefined) delete process.env.PAYLOAD_BLOB_FAKE
  else process.env.PAYLOAD_BLOB_FAKE = prevFake
})

const STORE = 'https://fakestore.public.blob.vercel-storage.com'
const PAST = { id: 1, type: 'one_time', eventDate: '2026-01-15T00:00:00.000Z', eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }

function setup(events: Record<string, unknown>[]) {
  fake = createPayloadFake({ events: events as never, 'event-photos': [] })
  // Payload enforces the unique `filename` index; the fake does not, so mirror it here.
  const create = fake.create
  fake.create = (async (args: { collection: string; data: Record<string, unknown> }) => {
    if (args.collection === 'event-photos' && fake.store['event-photos'].some((d) => d.filename === args.data.filename)) {
      throw new ValidationError({ collection: 'event-photos', errors: [{ path: 'filename', message: 'Value must be unique' }] })
    }
    return create(args)
  }) as typeof fake.create
}

const created = () => (fake.callsTo('create', 'event-photos').at(-1)?.args as { data: Record<string, unknown>; overrideAccess?: boolean } | undefined) ?? null

beforeEach(() => {
  fixedNow = new Date('2026-06-01T12:00:00.000Z')
  head.mockClear()
  setup([PAST])
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('submitEventPhoto', () => {
  it('registers the existing blob as a pending event photo (spec §7.4 recipe: no url, focal 50/50)', async () => {
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(
      formData({ eventId: '1', url: `${STORE}/events/pending/img-1234-1-Ab3De5Fg7Hi9Jk1Lm3No5Pq.jpg`, submitterName: 'Pat', caption: 'Great day' })
    )
    expect(result).toBeUndefined()
    expect(head).toHaveBeenCalledWith(`${STORE}/events/pending/img-1234-1-Ab3De5Fg7Hi9Jk1Lm3No5Pq.jpg`, expect.objectContaining({ token: expect.stringMatching(/^vercel_blob_rw_fakestore_/) }))
    expect(created()!.overrideAccess).toBe(true)
    expect(created()!.data).toEqual({
      filename: 'img-1234-1-Ab3De5Fg7Hi9Jk1Lm3No5Pq.jpg',
      prefix: 'events/pending',
      mimeType: 'image/jpeg',
      filesize: 2048,
      focalX: 50,
      focalY: 50,
      event: 1,
      status: 'pending',
      caption: 'Great day',
      submitterName: 'Pat',
    })
  })

  it('returns a friendly error when the same uploaded URL is submitted twice (unique filename)', async () => {
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const fd = () => formData({ eventId: '1', url: `${STORE}/events/pending/a-x1.jpg` })
    expect(await submitEventPhoto(fd())).toBeUndefined()
    expect(await submitEventPhoto(fd())).toEqual({ error: 'This photo has already been sent in. Thanks!' })
    expect(fake.store['event-photos']).toHaveLength(1)
  })

  it('rejects a future one-time event', async () => {
    setup([{ ...PAST, id: 2, eventDate: '2027-01-15T00:00:00.000Z' }])
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: '2', url: `${STORE}/events/pending/a.jpg` }))
    expect(result).toEqual({ error: 'Photos can only be submitted for a past event.' })
    expect(created()).toBeNull()
  })

  it('rejects a nonexistent event', async () => {
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: '999', url: `${STORE}/events/pending/a.jpg` }))
    expect(result).toEqual({ error: 'Event not found.' })
    expect(created()).toBeNull()
  })

  it('rejects a recurring event (recap photos are one-time-event only)', async () => {
    setup([{ id: 3, type: 'recurring', eventDate: null, eventTime: '18:00', dayOfWeek: '4', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-03-01T00:00:00.000Z' }])
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: '3', url: `${STORE}/events/pending/a.jpg` }))
    expect(result).toEqual({ error: 'Photos can only be submitted for a past event.' })
    expect(created()).toBeNull()
  })

  it.each([
    ['a missing url', ''],
    ['a non-Blob url', 'https://evil.example.com/a.jpg'],
    ['a Blob URL outside events/pending/ (another entity\'s blob)', `${STORE}/gallery/some-photo.jpg`],
    ['an approved event photo path', `${STORE}/events/presentation-1.jpg`],
    ['a nested path under events/pending/', `${STORE}/events/pending/x/a.jpg`],
    ['a foreign store hostname', 'https://attacker-store.public.blob.vercel-storage.com/events/pending/a.jpg'],
    ['plain http', 'http://fakestore.public.blob.vercel-storage.com/events/pending/a.jpg'],
    ['a query string', `${STORE}/events/pending/a.jpg?download=1`],
    ['a hash', `${STORE}/events/pending/a.jpg#x`],
    ['a dot-dot segment', `${STORE}/events/pending/../gallery/a.jpg`],
    ['an encoded slash', `${STORE}/events/pending/..%2Fgallery%2Fa.jpg`],
    ['an unsafe basename (spaces)', `${STORE}/events/pending/IMG%201234%20(1).jpg`],
  ])('rejects %s without registering anything', async (_label, url) => {
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    expect(await submitEventPhoto(formData({ eventId: '1', url }))).toEqual({ error: 'A photo is required.' })
    expect(created()).toBeNull()
    expect(head).not.toHaveBeenCalled()
  })

  it('rejects when the blob is not an image or cannot be read', async () => {
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    head.mockResolvedValueOnce({ url: '', size: 10, contentType: 'text/html' })
    expect(await submitEventPhoto(formData({ eventId: '1', url: `${STORE}/events/pending/a.jpg` }))).toEqual({ error: 'A photo is required.' })
    head.mockRejectedValueOnce(new Error('not found'))
    expect(await submitEventPhoto(formData({ eventId: '1', url: `${STORE}/events/pending/b.jpg` }))).toEqual({ error: 'A photo is required.' })
    expect(created()).toBeNull()
  })

  it('rejects everything when there is no Blob store (no token: uploads are unavailable)', async () => {
    process.env.PAYLOAD_BLOB_FAKE = ''
    try {
      const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
      expect(await submitEventPhoto(formData({ eventId: '1', url: `${STORE}/events/pending/a.jpg` }))).toEqual({ error: 'A photo is required.' })
    } finally {
      process.env.PAYLOAD_BLOB_FAKE = '1'
    }
  })

  it('rejects a non-numeric eventId without crashing', async () => {
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const result = await submitEventPhoto(formData({ eventId: 'not-a-number', url: `${STORE}/events/pending/a.jpg` }))
    expect(result).toEqual({ error: 'Event not found.' })
    expect(created()).toBeNull()
  })

  it('truncates an overly long caption and submitterName instead of erroring', async () => {
    const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
    const longText = 'x'.repeat(500)
    const result = await submitEventPhoto(formData({ eventId: '1', url: `${STORE}/events/pending/a.jpg`, caption: longText, submitterName: longText }))
    expect(result).toBeUndefined()
    expect((created()!.data.caption as string).length).toBe(200)
    expect((created()!.data.submitterName as string).length).toBe(200)
  })
})
