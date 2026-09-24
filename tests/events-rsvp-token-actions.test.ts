import { describe, it, expect, vi, beforeEach } from 'vitest'

let row: Record<string, unknown> | null = null
let updated: Record<string, unknown> | null = null
let deleted = false

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(row ? [row] : []) }) }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated = v
          return Promise.resolve()
        },
      }),
    }),
    delete: () => ({
      where: () => {
        deleted = true
        return Promise.resolve()
      },
    }),
  },
}))

beforeEach(() => {
  updated = null
  deleted = false
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('updateRsvpByToken', () => {
  it('updates name/email/note for a matching token', async () => {
    row = { id: 1, editToken: 'tok', name: 'Old Name' }
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await updateRsvpByToken('tok', formData({ name: 'New Name', email: '', note: 'bringing salad' }))
    expect(result).toBeUndefined()
    expect(updated).toMatchObject({ name: 'New Name', note: 'bringing salad' })
  })

  it('returns an error for an unknown token without throwing', async () => {
    row = null
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await updateRsvpByToken('missing', formData({ name: 'New Name' }))
    expect(result).toEqual({ error: 'This RSVP link is no longer valid.' })
    expect(updated).toBeNull()
  })

  it('rejects an empty name', async () => {
    row = { id: 1, editToken: 'tok', name: 'Old Name' }
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await updateRsvpByToken('tok', formData({ name: '' }))
    expect(result).toEqual({ error: 'Name is required.' })
    expect(updated).toBeNull()
  })
})

describe('cancelRsvpByToken', () => {
  it('deletes the matching row', async () => {
    row = { id: 1, editToken: 'tok', name: 'Old Name' }
    const { cancelRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await cancelRsvpByToken('tok')
    expect(result).toBeUndefined()
    expect(deleted).toBe(true)
  })

  it('returns an error for an unknown token', async () => {
    row = null
    const { cancelRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await cancelRsvpByToken('missing')
    expect(result).toEqual({ error: 'This RSVP link is no longer valid.' })
    expect(deleted).toBe(false)
  })
})
