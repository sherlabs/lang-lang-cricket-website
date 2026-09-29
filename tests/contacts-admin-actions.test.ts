import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown> | null = null
let updated: Record<string, unknown> | null = null
let deleted = 0
let selected = 0
let cookieValue: string | undefined = 'token'

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }))
vi.mock('@/lib/auth', () => ({
  COOKIE_NAME: 'llcc_admin_session',
  verifySessionCookie: async (token: string) => token === 'token',
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => {
        selected++
        return Promise.resolve([])
      },
    }),
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
    delete: () => ({
      where: () => {
        deleted++
        return Promise.resolve()
      },
    }),
  },
}))

const load = () => import('@/app/admin/(shell)/contacts/actions')

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  inserted = null
  updated = null
  deleted = 0
  selected = 0
  cookieValue = 'token'
})

describe('auth guard', () => {
  const unauth = [
    ['listContacts', (a: Awaited<ReturnType<typeof load>>) => a.listContacts()],
    ['removeContact', (a: Awaited<ReturnType<typeof load>>) => a.removeContact(1)],
    ['updateContact', (a: Awaited<ReturnType<typeof load>>) => a.updateContact(1, { name: 'x' })],
    ['createContact', (a: Awaited<ReturnType<typeof load>>) => a.createContact(form({ name: 'x', role: 'y' }))],
    ['editContact', (a: Awaited<ReturnType<typeof load>>) => a.editContact(form({ id: '1', name: 'x', role: 'y' }))],
  ] as const

  it.each(unauth)('%s throws Unauthorized without a session cookie', async (_name, call) => {
    cookieValue = undefined
    const actions = await load()
    await expect(call(actions)).rejects.toThrow('Unauthorized')
    expect(inserted).toBeNull()
    expect(updated).toBeNull()
    expect(deleted).toBe(0)
    expect(selected).toBe(0)
  })

  it.each(unauth)('%s throws Unauthorized with an invalid session cookie', async (_name, call) => {
    cookieValue = 'forged'
    const actions = await load()
    await expect(call(actions)).rejects.toThrow('Unauthorized')
    expect(inserted).toBeNull()
    expect(updated).toBeNull()
    expect(deleted).toBe(0)
    expect(selected).toBe(0)
  })
})

describe('createContact', () => {
  it('stores trimmed fields and the chosen section', async () => {
    const { createContact } = await load()
    await createContact(
      form({ role: ' U12s Coach ', name: ' Sam ', phone: '', email: ' sam@example.com ', section: 'coach', sortOrder: '3' })
    )
    expect(inserted).toEqual({
      role: 'U12s Coach',
      name: 'Sam',
      phone: '',
      email: 'sam@example.com',
      photoUrl: '',
      section: 'coach',
      sortOrder: 3,
    })
  })

  it('falls back to committee for an unknown section and 0 for a bad sort order', async () => {
    const { createContact } = await load()
    await createContact(form({ role: 'President', name: 'Pat', section: 'nope', sortOrder: 'abc' }))
    expect(inserted).toMatchObject({ section: 'committee', sortOrder: 0 })
  })
})

describe('editContact', () => {
  it('updates the section along with the other fields', async () => {
    const { editContact } = await load()
    await editContact(form({ id: '7', role: 'Captain', name: 'Lee', section: 'leadership' }))
    expect(updated).toMatchObject({ role: 'Captain', name: 'Lee', section: 'leadership' })
  })
})

describe('removeContact and listContacts', () => {
  it('reach the db when authenticated', async () => {
    const { removeContact, listContacts } = await load()
    await removeContact(4)
    expect(deleted).toBe(1)
    await expect(listContacts()).resolves.toEqual([])
    expect(selected).toBe(1)
  })
})
