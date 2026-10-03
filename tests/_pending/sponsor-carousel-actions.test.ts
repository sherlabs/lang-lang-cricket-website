import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown> | null = null
let upserted: Record<string, unknown> | null = null
let authed = true

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/auth', () => ({ COOKIE_NAME: 'llcc_admin_session', verifySessionCookie: async () => authed }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v
        return {
          onConflictDoUpdate: (u: { set: Record<string, unknown> }) => {
            upserted = u.set
            return Promise.resolve()
          },
        }
      },
    }),
  },
}))

beforeEach(() => {
  inserted = null
  upserted = null
  authed = true
})

function formData(tiers: string[]): FormData {
  const fd = new FormData()
  for (const t of tiers) fd.append('tiers', t)
  return fd
}

describe('saveSponsorCarouselTiers', () => {
  it('rejects when not signed in as admin', async () => {
    authed = false
    const { saveSponsorCarouselTiers } = await import('@/app/admin/(shell)/sponsors/carousel-actions')
    await expect(saveSponsorCarouselTiers(formData(['Gold']))).rejects.toThrow('Unauthorized')
    expect(inserted).toBeNull()
  })

  it('drops tiers that are not in the allowed list and orders the rest', async () => {
    const { saveSponsorCarouselTiers } = await import('@/app/admin/(shell)/sponsors/carousel-actions')
    await saveSponsorCarouselTiers(formData(['Bogus', 'Gold', 'Platinum', '<script>']))
    expect(inserted).toMatchObject({ key: 'sponsorCarouselTiers', value: ['Platinum', 'Gold'] })
    expect(upserted).toMatchObject({ value: ['Platinum', 'Gold'] })
    expect(upserted!.updatedAt).toBeInstanceOf(Date)
  })

  it('stores an empty list when nothing is ticked, which hides the carousel', async () => {
    const { saveSponsorCarouselTiers } = await import('@/app/admin/(shell)/sponsors/carousel-actions')
    await saveSponsorCarouselTiers(formData([]))
    expect(inserted).toMatchObject({ key: 'sponsorCarouselTiers', value: [] })
    expect(upserted).toMatchObject({ value: [] })
  })
})
